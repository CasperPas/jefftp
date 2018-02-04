import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as config from './config';
import * as SFTP from 'ssh2-sftp-client';

var connected = false;

export function upload() {
    const cfg = config.getConfig();
    console.log(cfg);
    const filePath = vscode.window.activeTextEditor.document.uri.fsPath;
    console.log(filePath);
    if (filePath.indexOf(vscode.workspace.rootPath) !== 0) {
        const fileName = path.basename(filePath);
        vscode.window.showErrorMessage(`File '${fileName}' does not belong to your current project`);
        return;
    }

    const fileRelativePath = filePath.replace(vscode.workspace.rootPath, '');
    const remoteFilePath = path.join(cfg.remote_path, fileRelativePath);
    const keyPath = cfg.ssh_key_file.replace('~', os.homedir());
    const privateKey = fs.readFileSync(keyPath).toString();
    const sftp = new SFTP();
    sftp.connect({
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.user,
        privateKey: privateKey
    }).then(() => {
        connected = true;
        return sftp.put(filePath, remoteFilePath, true, 'UTF-8');
    }, err => {
        console.log(err);
    }).then(() => {
        console.log(`'${filePath}' has been uploaded successfully to '${remoteFilePath}'`);
    }).catch(err => {
        console.log(err);
    });
}