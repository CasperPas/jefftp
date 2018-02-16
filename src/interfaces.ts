import { OutputChannel } from "vscode";

export interface Configurations {
    type: string;
    save_before_upload: boolean;
    upload_on_save: boolean;
    sync_down_on_open: boolean;
    sync_skip_deletes: boolean;
    sync_same_age: boolean;
    confirm_downloads: boolean;
    confirm_sync: boolean;
    confirm_overwrite_newer: boolean;
    host: string;
    user: string;
    password: string;
    port: number;
    remote_path: string;
    connect_timeout: number;
    connection_limit: number;
    keepalive: number;
    ftp_passive_mode: boolean;
    ftp_obey_passive_host: boolean;
    ssh_key_file: string;
}

export interface FileInfo {
    type: string;
    name: string;
    size: number;
    modifyTime: number;
    rights: {
        user: string;
        group: string;
        other: string;
    };
    owner: string;
    group: string;
}

export interface FileTransferInfo {
    fromPath: string;
    toPath: string;
    size?: number;
    progress?: number;  // [0, 100]; -1: Failed!
}

export interface TransferPathInfo {
    files: FileTransferInfo[];
    dirs: string[];
}

export interface LogOutputChannel {
    out: OutputChannel;
    lines: string[];
    currentLineCursor: number;
}