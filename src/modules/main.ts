import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as SFTP from 'ssh2-sftp-client';
import * as async from 'async';
import { execFile } from 'child_process';
import * as mkdirp from 'mkdirp';

import { Sync } from './sync';
import { Log } from './log';
import { getConfig, getConfigPath } from './config';
import { Configurations, FileTransferInfo, TransferPathInfo } from '../interfaces';
import { SFTPWrapper } from 'ssh2';
import { resolve } from 'path';
import { ExplorerTreeDataProvider, ExNode, EXPLORER_SCHEME } from './explorer';

const TRANSFER_CHANNEL = "JEFFTP: Transfer";
const MAX_RETRY_NUM = 5;

export class JEFFTP {
    private config: Configurations;
    private sync: Sync;
    // private transferLogStartLine
    private transferingList: FileTransferInfo[];
    private transferOutputHash: { [id: string]: number }

    constructor(private context: vscode.ExtensionContext) {
        this.initialize();
    }

    initialize() {
        Log.append("Initializing JEFFTP...");

        this.registerCommand("extension.sftp.upload_current", this.upload, this);
        this.registerCommand("extension.sftp.upload_context", this.upload, this);
        this.registerCommand("extension.sftp.upload_open_files", this.uploadOpenFiles, this);
        this.registerCommand("extension.sftp.explorer.download", this.download, this);
        this.registerCommand('extension.sftp.explorer.open', this._openExplorerItem, this);
        this.registerCommand('extension.sftp.explorer.show', this.showExplorer, this);
        this.registerCommand('extension.sftp.explorer.hide', this.hideExplorer, this);

        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.uri.fsPath === getConfigPath()) {
                Log.appendLine("Config file has changed!");
                this.config = getConfig();
                this.sync.updateConfig(this.config);
            } else {
                this.uploadOnSave();
            }
        });
        this.config = getConfig();
        this.sync = new Sync(this.config);

        const explorerProvider = new ExplorerTreeDataProvider();
        vscode.window.registerTreeDataProvider('jefftpExplorer', explorerProvider);
        vscode.workspace.registerTextDocumentContentProvider(EXPLORER_SCHEME, explorerProvider);
        this.hideExplorer();
        this.showExplorer();

        Log.appendLine("Done!");
    }

    private _openExplorerItem(args: any) {
        const node: ExNode = Array.isArray(args) ? args[0] : args;
        let uri = vscode.Uri.parse(`untitled:jefftp::${node.resource.fsPath}`);
        vscode.workspace.openTextDocument(uri).then(document => {
            vscode.window.showTextDocument(document).then(() => {
                // setTimeout(() => {
                //     let wsEdit = new vscode.WorkspaceEdit();
                //     let textedit = new vscode.TextEdit(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), "hahaha");
                //     wsEdit.set(uri, [textedit]);
                //     vscode.workspace.applyEdit(wsEdit);
                // }, 100);
            });
        });
    }

    private showExplorer() {
        this.toggleExplorer(true);
    }

    private hideExplorer() {
        this.toggleExplorer(false);
    }

    private toggleExplorer(enable: boolean) {
        vscode.commands.executeCommand('setContext', 'treeViewEnabled', enable);
    }

    uploadOnSave() {
        if (!this.config || !this.config.upload_on_save) return;
        this.upload();
    }

    upload(args?: any) {
        let uri: vscode.Uri = args;
        if (!uri) uri = vscode.window.activeTextEditor.document.uri;
        fs.stat(uri.fsPath, (err, stats) => {
            if (stats.isFile()) {
                this.uploadFile(uri.fsPath);
            } else if (stats.isDirectory()) {
                this.uploadFolder(uri.fsPath);
            }
        });
    }

    uploadFile(filePath: string) {
        if (filePath.indexOf(vscode.workspace.rootPath) !== 0) {
            const fileName = path.basename(filePath);
            vscode.window.showErrorMessage(`File '${fileName}' does not belong to your current project`);
            return;
        }
        this.uploadFiles([filePath]);
    }

    uploadOpenFiles() {
        // let filePaths = vscode.window.visibleTextEditors.map(editor => {
        //     return editor.document.uri.fsPath;
        // });
        // vscode.workspace.textDocuments.forEach(doc => {
        //     if (!doc.isClosed) {
        //         console.log(doc.uri.fsPath);
        //     }
        // });
        // if (filePaths.length) {
        //     this.uploadFiles(filePaths);
        // }
    }

    _createFolders(dirs: string[], cfg: Configurations): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            async.eachLimit(
                dirs,
                cfg.connection_limit,
                (dir, cb) => {
                    this.sync.mkdir(dir, true)
                        .then(() => cb(null))
                        .catch(err => cb(err));
                },
                err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                }
            );
        });
    }

    _transferFiles(files: FileTransferInfo[], cfg: Configurations): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            async.eachLimit(
                files,
                cfg.connection_limit,
                (file, cb) => {
                    file.progress = 0;
                    this.updateTransferStatus(file);
                    this.sync.put(file.fromPath, file.toPath, true)
                        .then(() => {
                            file.progress = 100;
                            this.updateTransferStatus(file);
                            Log.appendLine(`'${file.fromPath}' has been uploaded successfully to '${file.toPath}'`);
                            cb(null);
                        })
                        .catch(err => {
                            file.progress = -1;
                            this.updateTransferStatus(file);
                            Log.appendLine(`Failed to upload '${file.fromPath}'!`);
                            cb(null);
                        });
                },
                err => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                }
            );
        });
    }

    uploadFiles(filePaths: string[], retries?: number) {
        const cfg = this.getConfig();
        const transferInfo = this.preparePaths(filePaths, vscode.workspace.rootPath, cfg.remote_path);

        this.resetTransferLog();
        Log.append(`Connecting to ${cfg.host} as ${cfg.user}...`, TRANSFER_CHANNEL);
        this.sync.connect()
            .then(() => Log.appendLine("success!", TRANSFER_CHANNEL))
            .then(() => this._createFolders(transferInfo.dirs, cfg))
            .then(() => this._transferFiles(transferInfo.files, cfg))
            .catch(err => {
                retries = retries || 0;
                if (retries < MAX_RETRY_NUM) {
                    this.uploadFiles(filePaths, retries + 1);
                }
                console.log(err);
            });
    }

    uploadFolder(folderPath: string) {
        execFile('find', [folderPath], (err, stdout, stderr) => {
            var file_list = stdout.split('\n');
            async.filterLimit(
                file_list,
                50,
                (filePath, cb) => {
                    fs.stat(filePath, (err, stats) => {
                        cb(null, stats && stats.isFile());
                    })
                },
                (err, filtered) => {
                    if (!err && filtered.length) {
                        this.uploadFiles(filtered);
                    }
                }
            );
        });
    }

    download(args?: any) {
        const exNode: ExNode = args;
        if (!exNode) return;

        if (exNode.isFolder) {
            this.downloadFolder(exNode.path);
        } else {
            this.downloadFiles([exNode.path]);
        }
    }

    downloadFiles(filePaths: string[]) {
        const cfg = this.getConfig();
        const transferInfo = this.preparePaths(filePaths, cfg.remote_path, vscode.workspace.rootPath);

        this.resetTransferLog();
        Log.append(`Connecting to ${cfg.host} as ${cfg.user}...`, TRANSFER_CHANNEL);
        this.sync.connect().then(() => {
            // Create folders before download files
            Log.appendLine("success!", TRANSFER_CHANNEL);
            return new Promise<void>((resolve, reject) => {
                async.eachLimit(
                    transferInfo.dirs,
                    cfg.connection_limit,
                    (dir, cb) => {
                        mkdirp(dir, null, err => {
                            cb(err);
                        });
                    },
                    err => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    }
                );
            });
        }, err => {
            console.log(err);
        }).then(() => {
            // Download multiple files
            return new Promise<void>((resolve, reject) => {
                async.eachLimit(
                    transferInfo.files,
                    cfg.connection_limit,
                    (file, cb) => {
                        file.progress = 0;
                        this.updateTransferStatus(file);
                        this.sync.get(file.fromPath, true)
                            .then(stream => {
                                const writeStream = fs.createWriteStream(file.toPath, { flags: 'w' });
                                stream.on('end', () => {
                                    writeStream.end();
                                    file.progress = 100;
                                    this.updateTransferStatus(file);
                                    cb(null);
                                });
                                stream.pipe(writeStream);
                            });
                    },
                    err => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    }
                );
            });
        }).catch(err => {
            console.log(err);
        });
    }

    downloadFolder(folderPath: string) {
        let dirs = [folderPath];
        let filePaths = [];
        const cfg = this.getConfig();
        Log.append(`Connecting to ${cfg.host} as ${cfg.user}...`, TRANSFER_CHANNEL);
        this.sync.connect()
            .then(() => {
                Log.appendLine(`success!`, TRANSFER_CHANNEL);
                async.whilst(
                    () => dirs.length > 0,
                    cb => {
                        const dir = dirs.pop();
                        Log.appendLine(`Fetching ${dir} content`, TRANSFER_CHANNEL);
                        this.sync.list(dir)
                            .then(items => {
                                items.forEach(item => {
                                    const itemPath = path.join(dir, item.name)
                                    if (item.type === "d" || item.type === "l") {
                                        dirs.push(itemPath);
                                    } else {
                                        filePaths.push(itemPath);
                                    }
                                });
                                cb(null);
                            });
                    },
                    err => {
                        this.downloadFiles(filePaths);
                    }
                );
            })
            .catch(err => console.log(err));
    }

    destroy() {

    }

    private preparePaths(fileSrcPaths: string[], srcRoot: string, dstRoot: string): TransferPathInfo {
        let dirsHash = {};
        fileSrcPaths = fileSrcPaths.filter(filePath => {
            if (filePath.indexOf(srcRoot) !== 0) {
                Log.appendLine(`File '${filePath}' does not belong to your current project`);
                return false;
            }
            return true;
        });

        const cfg = this.getConfig();

        let fileDstPaths: FileTransferInfo[] = fileSrcPaths.map(filePath => {
            const fileRelativePath = filePath.replace(srcRoot, '');
            const fileDstPath = path.join(dstRoot, fileRelativePath);
            dirsHash[path.dirname(fileDstPath)] = true;
            return {
                fromPath: filePath,
                toPath: fileDstPath
            } as FileTransferInfo;
        });

        let dstDirs = Object.keys(dirsHash).sort((a, b) => {
            return a > b ? 1 : -1;
        }).reduce((list: string[], file) => {
            if (list.length) {
                let lastPath = list.pop();
                if (file.indexOf(lastPath) !== 0) list.push(lastPath);
            }

            list.push(file);
            return list;
        }, []);

        return {
            files: fileDstPaths,
            dirs: dstDirs
        };
    }

    private getConfig(): Configurations {
        if (!this.config) {
            this.config = getConfig();
        }

        if (!this.config) return null;

        return this.config;
    }

    private registerCommand(name: string, callback: (args: any[]) => any, thisArg?: any) {
        let disposable = vscode.commands.registerCommand(name, callback, thisArg);
        this.context.subscriptions.push(disposable);
    }

    private resetTransferLog() {
        this.transferingList = [];
        this.transferOutputHash = {};
        Log.clear(TRANSFER_CHANNEL);
        Log.show(TRANSFER_CHANNEL);
    }
    private updateTransferStatus(file: FileTransferInfo) {
        const transferHashKey = `${file.fromPath} -> ${file.toPath}`;
        if (this.transferOutputHash[transferHashKey] == undefined) {
            this.transferOutputHash[transferHashKey] = this.transferingList.length;
            this.transferingList.push(file);
            Log.appendLine(`Transfering ${file.fromPath} to ${file.toPath}...`, TRANSFER_CHANNEL);
        }
        const line = this.transferOutputHash[transferHashKey] + 1;
        switch (file.progress) {
            case -1:
                Log.append('Failed!', TRANSFER_CHANNEL, line);
                break;
            case 100:
                Log.append('Success!', TRANSFER_CHANNEL, line);
                break;
            default:
                break;
        }
    }
}