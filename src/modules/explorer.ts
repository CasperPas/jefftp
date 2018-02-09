import {
    ExtensionContext,
    TreeDataProvider,
    EventEmitter,
    TreeItem,
    Event,
    window,
    TreeItemCollapsibleState,
    Uri,
    commands,
    workspace,
    TextDocumentContentProvider,
    CancellationToken,
    ProviderResult
} from 'vscode';
import * as path from 'path';
import { getConfig, getConfigPath } from './config';
import { Configurations, FileInfo } from '../interfaces';
import { Sync } from './sync';

let config: Configurations;
let sync: Sync;

workspace.onDidSaveTextDocument((doc) => {
    if (doc.uri.fsPath === getConfigPath()) {
        config = getConfig();
        if (sync) {
            sync.updateConfig(config);
        }
    }
});

enum EntryType {
    File,
    Folder
}

interface Entry {
    name: string;
    fileInfo?: FileInfo;
    type: EntryType;
}

export const EXPLORER_SCHEME = "jefftp";

export class ExNode {
    private _resource: Uri;
    constructor(private _entry: Entry, private _parent: ExNode) {
        if (!_parent) {
            this._resource = Uri.parse(`${EXPLORER_SCHEME}:${config.remote_path}`);
        } else {
            this._resource = Uri.parse(`${EXPLORER_SCHEME}:${_parent.path}/${_entry.fileInfo.name}`);
        }
    }

    public get resource(): Uri {
        return this._resource;
    }

    public get path(): string {
        return this._resource.fsPath;
    }

    public get name(): string {
        return this._entry.name;
    }

    public get isFolder(): boolean {
        return this._entry.type === EntryType.Folder;
    }

    public get children(): Thenable<ExNode[]> {
        return sync.connect().then(() => {
            return sync.list(this._resource.fsPath)
                .then(items => {
                    return items.map(item => {
                        return new ExNode({
                            name: item.name,
                            type: item.type === "d" || item.type === "l" ? EntryType.Folder : EntryType.File,
                            fileInfo: item
                        }, this);
                    }).sort((a, b) => {
                        if (a.isFolder != b.isFolder) return a.isFolder ? -1 : 1;
                        return a.name > b.name ? 1 : -1;
                    });
                });
        });
    }
}

export class ExplorerTreeDataProvider implements TreeDataProvider<ExNode>, TextDocumentContentProvider {
    private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();
    readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

    constructor() {
        config = getConfig();
        sync = new Sync(config);
    }

    public getTreeItem(element: ExNode): TreeItem {
        return {
            label: element.name,
            collapsibleState: element.isFolder ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None,
            contextValue: element.isFolder ? "folder" : "file",
            command: element.isFolder ? void 0 : {
                command: 'extension.sftp.explorer.open',
                arguments: [element],
                title: 'Open Resource'
            }
        };
    }

    public getChildren(element?: ExNode): ExNode[] | Thenable<ExNode[]> {
        if (!element) {
            element = new ExNode({
                name: "Root",
                type: EntryType.Folder
            }, null);   // Root node
        }

        return element.children;
    }

    public provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
        return sync.connect().then(() => {
            return new Promise<string>((resolve, reject) => {
                sync.get(uri.fsPath, true).then(stream => {
                    let content = '';
                    stream.on('data', buff => {
                        if (buff) {
                            content += buff.toString();
                        }
                    });
                    stream.on('end', () => {
                        resolve(content);
                    });
                }).catch(err => reject(err));
            });
        });
    }
}