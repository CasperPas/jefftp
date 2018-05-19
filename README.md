# JEFFTP (Just Enough For FTP)

[Visual Studio Code](http://code.visualstudio.com) (VSCode) extension that helps you transfer your files to a server using SFTP/FTP/FTPS.
This plugin is still in development & welcome developers to contribute (fork & create pull requests).

## Features

* Upload current file
* Upload File/Folder from File Explorer Panel
* Upload on file save (`upload_on_save` set to `true`. Default to `false`)
* Browser remote server files/folders (`Readonly`)

## Requirements

Using this extension with VSCode 1.19.0+ would be great

## Extension Settings

All connection settings will be placed in `${workspaceFolder}/.vscode/sftp.json`

## Known Issues


## Release Notes

### 0.3.0

* Add transfering queue
* Ability to set files & folders permissions (on behalf of current user)

### 0.2.3

* Fix remote file view

### 0.2.2

* Keep current connection instead of reconnect everytime

### 0.2.0

* Add download File/Folder from Remote Explorer
* Bug fixes

### 0.1.0

* Initial release of JEFFTP

## License
[MIT](https://github.com/CasperPas/jefftp/blob/master/LICENSE)