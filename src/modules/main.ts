import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as SFTP from 'ssh2-sftp-client';
import * as async from 'async';
import { execFile } from 'child_process';

import { upload } from './sync';
import { getConfig, getConfigPath } from './config';
import { Configurations } from '../interfaces';
import { SFTPWrapper } from 'ssh2';
import { resolve } from 'path';

enum UploadStatus {
    Ongoing,
    Success,
    Failed
}

export class JEFFTP {

    private out: vscode.OutputChannel;
    private config: Configurations;
    private uploadOutputHash: { [id: string]: UploadStatus }

    constructor(private context: vscode.ExtensionContext) {
        this.initialize();
    }

    initialize() {
        this.registerCommand("extension.sftp.upload_current", this.upload, this);
        this.registerCommand("extension.sftp.upload_context", this.upload, this);
        this.registerCommand("extension.sftp.upload_open_files", this.uploadOpenFiles, this);
        this.out = vscode.window.createOutputChannel("JEFFTP");
        this.out.append("Initializing JEFFTP...");
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.uri.fsPath === getConfigPath()) {
                this.out.appendLine("Config file has changed!");
                this.config = getConfig();
            } else {
                this.uploadOnSave();
            }
        });
        this.out.appendLine("Done!");
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
                this.out.appendLine(`File '${filePath}' does not belong to your current project`);
                return false;
            }
            return true;
        });

        const cfg = this.getConfig();

        let fileRemotePaths = filePaths.map(filePath => {
            const fileRelativePath = filePath.replace(vscode.workspace.rootPath, '');
            const fileRemotePath = path.join(cfg.remote_path, fileRelativePath);
            dirsHash[path.dirname(fileRemotePath)] = true;
            return {
                local: filePath,
                remote: fileRemotePath
            };
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

        const keyPath = cfg.ssh_key_file.replace('~', os.homedir());
        const privateKey = fs.readFileSync(keyPath).toString();
        // console.log(`Connected: ${connected}`);
        const sftp = new SFTP();
        this.out.append(`Connecting to ${cfg.host} as ${cfg.user}...`);
        sftp.connect({
            host: cfg.host,
            port: cfg.port || 22,
            username: cfg.user,
            privateKey: privateKey
        }).then((abc: SFTPWrapper) => {
            // Create folders before upload files
            this.out.appendLine("success!");
            return new Promise<void>((resolve, reject) => {
                async.eachLimit(
                    remoteDirs,
                    cfg.connection_limit,
                    (dir, cb) => {
                        sftp.mkdir(dir, true)
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
                        sftp.put(file.local, file.remote, true, 'UTF-8')
                            .then(() => {
                                this.out.appendLine(`'${file.local}' has been uploaded successfully to '${file.remote}'`);
                                cb(null);
                            })
                            .catch(err => {
                                this.out.appendLine(`Failed to upload '${file.local}'!`);
                                // cb(err);
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
}