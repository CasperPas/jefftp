import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Configurations } from '../interfaces';

export function getConfigDir() {
    return `${vscode.workspace.rootPath}/.vscode`;
}

export function getConfigPath() {
    return `${getConfigDir()}/sftp.json`;
}

export const DEFAULT_CONFIGS: Configurations = {
    "type": "sftp",
    "save_before_upload": false,
    "upload_on_save": false,
    "sync_down_on_open": false,
    "sync_skip_deletes": false,
    "sync_same_age": true,
    "confirm_downloads": false,
    "confirm_sync": true,
    "confirm_overwrite_newer": false,
    "host": "host",
    "user": "user",
    "password": "password",
    "port": null,
    "remote_path": "/path/on/server",
    "file_permissions": null,
    "dir_permissions": null,
    "connect_timeout": 30,
    "connection_limit": 8,
    "use_compression": true,
    "keepalive": 120,
    "ftp_passive_mode": true,
    "ftp_obey_passive_host": false,
    "ssh_key_file": "~/.ssh/id_rsa",
};

export function initConfig() {
    if (!vscode.workspace.rootPath) {
        vscode.window.showErrorMessage("JEFFPT: Cannot init JEFFPT without opened folder");
        return;
    }

    if (!fs.existsSync(getConfigDir()))
        fs.mkdirSync(getConfigDir());

    if (fs.existsSync(getConfigPath()))
        vscode.window.showWarningMessage("JEFFPT: config already exists");
    else
        fs.writeFileSync(getConfigPath(), JSON.stringify(DEFAULT_CONFIGS, null, 4));

    var configDocument = vscode.workspace.openTextDocument(getConfigPath());
    configDocument.then(document => {
        vscode.window.showTextDocument(document);
    }, err => {
        console.log(err);
    });
}

export function checkConfig() {
    if (!fs.existsSync(getConfigPath())) {
        let yesStr = "Create config now...";
        let pick = vscode.window.showInformationMessage("No configuration file found. Would you like to init it first?", yesStr);
        pick.then(answer => {
            if (answer == yesStr)
                initConfig();
        }, err => {
            console.log(err);
        })
        return false;
    }
    return true;
}

export function getConfig() {
    let configObj = Object.assign({}, DEFAULT_CONFIGS);
    if (!checkConfig()) return configObj;

    let configJSON = fs.readFileSync(getConfigPath()).toString();

    try {
        configObj = Object.assign(configObj, JSON.parse(configJSON));
    } catch (err) {
        vscode.window.showErrorMessage(`Something wrong with config file.\n${err.message}`);
    }
    return configObj;
}