import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as SFTP from 'ssh2-sftp-client';
import * as FTP from 'ftp';
import { SFTPWrapper } from 'ssh2';
import { Configurations, FileInfo } from '../interfaces';
import { reject } from 'async';
import { resolve } from 'dns';

export class Sync {

    private sftp: SFTP;
    private ftp: FTP;
    private _connected: boolean;

    get isConnected(): boolean {
        return this._connected;
    }

    constructor(private config: Configurations) {
        this._connected = false;
    }

    updateConfig(cfg: Configurations) {
        this.disconnect();
        this.config = cfg;
    }

    connect(): Promise<void> {

        switch (this.config.type) {
            case 'sftp':
                return this._connectSFTP();

            case 'ftp':
                return this._connectFTP();

            default:
                return new Promise<void>((resolve, reject) => {
                    reject("Invalid connection type!");
                });
        }
    }

    disconnect() {
        this._disconnectSFTP();
        this._disconnectFTP();
    }

    list(remoteFilePath: string): Promise<FileInfo[]> {
        switch (this.config.type) {
            case 'sftp':
                return this._listSFTP(remoteFilePath);

            case 'ftp':
                return this._listFTP(remoteFilePath);

            default:
                return new Promise<FileInfo[]>((resolve, reject) => {
                    reject("Invalid connection type!");
                });
        }
    }

    get(remoteFilePath: string, useCompression?: boolean): Promise<NodeJS.ReadableStream> {
        switch (this.config.type) {
            case 'sftp':
                return this._getSFTP(remoteFilePath, useCompression);

            case 'ftp':
                return this._getFTP(remoteFilePath, useCompression);

            default:
                return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
                    reject("Invalid connection type!");
                });
        }
    }

    put(input: string | Buffer | NodeJS.ReadableStream, remoteFilePath: string, useCompression?: boolean): Promise<void> {
        switch (this.config.type) {
            case 'sftp':
                return this._putSFTP(input, remoteFilePath, useCompression);

            case 'ftp':
                return this._putFTP(input, remoteFilePath, useCompression);

            default:
                return new Promise<void>((resolve, reject) => {
                    reject("Invalid connection type!");
                });
        }
    }

    mkdir(remoteFilePath: string, recursive?: boolean): Promise<void> {
        switch (this.config.type) {
            case 'sftp':
                return this._mkdirSFTP(remoteFilePath, recursive);

            case 'ftp':
                return this._mkdirFTP(remoteFilePath, recursive);

            default:
                return new Promise<void>((resolve, reject) => {
                    reject("Invalid connection type!");
                });
        }
    }

    chmod(remoteFilePath: string, mode: string): Promise<void> {
        switch (this.config.type) {
            case 'sftp':
                return this._chmodSFTP(remoteFilePath, mode);

            case 'ftp':
                return this._chmodFTP(remoteFilePath, mode);

            default:
                return new Promise<void>((resolve, reject) => {
                    reject("Invalid connection type!");
                });
        }
    }

    //     rmdir(remoteFilePath: string, recursive?: boolean): Promise<void>;
    //   delete(remoteFilePath: string): Promise<void>;
    //   rename(remoteSourcePath: string, remoteDestPath: string): Promise<void>;

    private _connectSFTP(): Promise<void> {
        if (!this.sftp) {
            this.sftp = new SFTP();
        }
        if (this._connected) {
            return Promise.resolve();
        }
        let cfg = {
            host: this.config.host,
            port: this.config.port || 22,
            username: this.config.user,
            password: this.config.password,
            privateKey: null,
        }
        if (this.config.ssh_key_file) {
            const keyPath = this.config.ssh_key_file.replace('~', os.homedir());
            cfg.privateKey = fs.readFileSync(keyPath).toString();
        }
        return this.sftp.connect(cfg).then((wrapper: SFTPWrapper) => {
            this._connected = true;
            wrapper.on('ready', () => {
                console.log("SFTP connected");
                this._connected = true;
            });
            wrapper.on('close', () => {
                console.log("SFTP disconnected");
                this._connected = false;
            });
            wrapper.on('end', () => {
                console.log("SFTP disconnected");
                this._connected = false;
            });
            wrapper.on('error', (err) => {
                console.log("SFTP Error", err);
                this._connected = false;
            });
            return;
        });
    }

    private _connectFTP(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.ftp) {
                this.ftp = new FTP();
            }
            // TODO: Currently with FTP, always create new connection
            // if (this._connected) {
            //     resolve();
            // }
            this.ftp.once('ready', () => {
                this._connected = true;
                resolve();
            });
            this.ftp.once('error', err => {
                this._connected = false;
                console.log(err);
                reject(err);
            });
            this.ftp.once('close', err => {
                this._connected = false;
                console.log(err);
                console.log("FTP disconnected");
            });
            this.ftp.once('end', err => {
                this._connected = false;
                console.log(err);
                console.log("FTP disconnected");
            });
            this.ftp.connect({
                host: this.config.host,
                port: this.config.port,
                user: this.config.user,
                password: this.config.password,
                connTimeout: this.config.connect_timeout,
                keepalive: this.config.keepalive
            });
        });
    }

    private _disconnectSFTP() {
        this.sftp && this.sftp.end();
    }

    private _disconnectFTP() {
        this.ftp && this.ftp.end();
    }

    private _listSFTP(remoteFilePath: string): Promise<FileInfo[]> {
        if (!this.sftp) {
            return Promise.reject("Not connected yet!");
        }
        var promise = this.sftp.list(remoteFilePath).then(items => {
            return items.map<FileInfo>(item => {
                return {
                    name: item.name,
                    type: item.type,
                    modifyTime: item.modifyTime,
                    group: item.group.toString(),
                    owner: item.owner.toString(),
                    rights: item.rights,
                    size: item.size
                } as FileInfo;
            });
        });
        promise.catch(err => {
            console.log(err);
            this._connected = false;
        });
        return promise;
    }

    private _listFTP(remoteFilePath: string): Promise<FileInfo[]> {
        if (!this.ftp) {
            return Promise.reject("Not connected yet!");
        }

        return new Promise<FileInfo[]>((resolve, reject) => {
            this.ftp.list(remoteFilePath, (err, items) => {
                if (err) {
                    this._connected = false;
                    reject(err);
                    return;
                }
                resolve(
                    items.map<FileInfo>(item => {
                        return {
                            name: item.name,
                            type: item.type,
                            modifyTime: item.date.getTime() / 1000,
                            group: item.group,
                            owner: item.owner,
                            rights: item.rights,
                            size: parseInt(item.size)
                        } as FileInfo;
                    })
                );
            });
        });
    }

    private _getSFTP(remoteFilePath: string, useCompression?: boolean): Promise<NodeJS.ReadableStream> {
        if (!this.sftp) {
            return Promise.reject("Not connected yet!");
        }
        var promise = this.sftp.get(remoteFilePath, useCompression, 'UTF-8');
        promise.catch(err => {
            this._connected = false;
        });
        return promise;
    }

    private _getFTP(remoteFilePath: string, useCompression?: boolean): Promise<NodeJS.ReadableStream> {
        if (!this.ftp) {
            return Promise.reject("Not connected yet!");
        }
        return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
            this.ftp.get(remoteFilePath, useCompression, (err, stream) => {
                if (err) {
                    this._connected = false;
                    reject(err);
                    return;
                }
                resolve(stream);
            });
        });
    }

    private _putSFTP(input: string | Buffer | NodeJS.ReadableStream, remoteFilePath: string, useCompression: boolean = false): Promise<void> {
        if (!this.sftp) {
            return Promise.reject("Not connected yet!");
        }
        return this.sftp.put(input, remoteFilePath, useCompression);
    }

    private _putFTP(input: string | Buffer | NodeJS.ReadableStream, remoteFilePath: string, useCompression: boolean = false): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.ftp) {
                reject("Not connected yet!");
                return;
            }
            this.ftp.put(input, remoteFilePath, useCompression, err => {
                if (err) {
                    this._connected = false;
                    reject(err);
                } else {
                    resolve();
                }
            })
        });
    }

    private _mkdirSFTP(remoteFilePath: string, recursive?: boolean): Promise<void> {
        if (!this.sftp) {
            return Promise.reject("Not connected yet!");
        }
        return this.sftp.mkdir(remoteFilePath, recursive);
    }

    private _mkdirFTP(remoteFilePath: string, recursive?: boolean): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.ftp) {
                reject("Not connected yet!");
                return;
            }
            this.ftp.mkdir(remoteFilePath, recursive, err => {
                if (err) {
                    this._connected = false;
                    reject(err);
                } else {
                    resolve();
                }
            })
        });
    }

    private _chmodSFTP(remoteFilePath: string, mode: string): Promise<void> {
        if (!this.sftp) {
            return Promise.reject("Not connected yet!");
        }
        return this.sftp.chmod(remoteFilePath, mode);
    }

    private _chmodFTP(remoteFilePath: string, mode: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.ftp) {
                reject("Not connected yet!");
                return;
            }
            this.ftp.site(`chmod ${mode} ${remoteFilePath}`, err => {
                if (err) {
                    this._connected = false;
                    reject(err);
                } else {
                    resolve();
                }
            })
        });
    }
}