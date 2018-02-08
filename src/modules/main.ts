import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as SFTP from 'ssh2-sftp-client';
import * as async from 'async';
import { execFile } from 'child_process';

import { Sync } from './sync';
import { Log } from './log';
import { getConfig, getConfigPath } from './config';
import { Configurations, FileTransferInfo } from '../interfaces';
import { SFTPWrapper } from 'ssh2';
import { resolve } from 'path';

const TRANSFER_CHANNEL = "JEFFTP: Transfer";

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
        this.registerCommand("extension.sftp.upload_current", this.upload, this);
        this.registerCommand("extension.sftp.upload_context", this.upload, this);
        this.registerCommand("extension.sftp.upload_open_files", this.uploadOpenFiles, this);
        Log.append("Initializing JEFFTP...");
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
        Log.appendLine("Done!");
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

    uploadFiles(filePaths: string[]) {
        let dirsHash = {};
        filePaths = filePaths.filter(filePath => {
            if (filePath.indexOf(vscode.workspace.rootPath) !== 0) {
                Log.appendLine(`File '${filePath}' does not belong to your current project`);
                return false;
            }
            return true;
        });

        const cfg = this.getConfig();

        let fileRemotePaths: FileTransferInfo[] = filePaths.map(filePath => {
            const fileRelativePath = filePath.replace(vscode.workspace.rootPath, '');
            const fileRemotePath = path.join(cfg.remote_path, fileRelativePath);
            dirsHash[path.dirname(fileRemotePath)] = true;
            return {
                fromPath: filePath,
                toPath: fileRemotePath
            } as FileTransferInfo;
        });

        let remoteDirs = Object.keys(dirsHash).sort((a, b) => {
            return a.length - b.length;
        }).reduce((list: string[], file) => {
            if (list.length) {
                let lastPath = list.pop();
                list.push(file.indexOf(lastPath) === 0 ? file : lastPath);
            } else {
                list.push(file);
            }
            return list;
        }, []);

        this.resetTransferLog();
        Log.append(`Connecting to ${cfg.host} as ${cfg.user}...`, TRANSFER_CHANNEL);
        this.sync.connect().then(() => {
            // Create folders before upload files
            Log.appendLine("success!", TRANSFER_CHANNEL);
            return new Promise<void>((resolve, reject) => {
                async.eachLimit(
                    remoteDirs,
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
        }, err => {
            console.log(err);
        }).then(() => {
            // Upload multiple files
            return new Promise<void>((resolve, reject) => {
                async.eachLimit(
                    fileRemotePaths,
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
        }).catch(err => {
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

    destroy() {

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