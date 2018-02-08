import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as SFTP from 'ssh2-sftp-client';
import * as FTP from 'ftp';
import { SFTPWrapper } from 'ssh2';
import { Configurations } from '../interfaces';
import { reject } from 'async';
import { resolve } from 'dns';

export class Sync {

    sftp: SFTP;
    ftp: FTP;

    constructor(private config: Configurations) {
    }

    updateConfig(cfg: Configurations) {
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

//     list(remoteFilePath: string): Promise<sftp.FileInfo[]>;
//   get(remoteFilePath: string, useCompression?: boolean, encoding?: string): Promise<NodeJS.ReadableStream>;

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

//     rmdir(remoteFilePath: string, recursive?: boolean): Promise<void>;
//   delete(remoteFilePath: string): Promise<void>;
//   rename(remoteSourcePath: string, remoteDestPath: string): Promise<void>;

    private _connectSFTP(): Promise<void> {
        if (!this.sftp) {
            this.sftp = new SFTP();
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
        return this.sftp.connect(cfg).then((abc: SFTPWrapper) => {
            return;
        });
    }

    private _connectFTP(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.ftp) {
                this.ftp = new FTP();
            }
            this.ftp.once('ready', () => {
                resolve();
            });
            this.ftp.once('error', err => {
                reject(err);
            });
            this.ftp.put
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
                    reject(err);
                } else {
                    resolve();
                }
            })
        });
    }
}