import * as vscode from 'vscode';
import { LogOutputChannel } from '../interfaces';

export class Log {
    private static _instance: Log;
    private static readonly DEFAULT_CHANNEL: string = "JEFFTP";
    private channels: { [id: string]: LogOutputChannel };

    private constructor() {
        this.channels = {};
    }

    static Instance(): Log {
        if (!Log._instance) {
            Log._instance = new Log();
        }
        return Log._instance;
    }

    static append(text: string, channelName: string = Log.DEFAULT_CHANNEL, line?: number): void {
        Log.Instance().append(text, channelName, line);
    }

    static insertLine(text: string, line: number, channelName: string = Log.DEFAULT_CHANNEL): void {
        Log.Instance().insertLine(text, line, channelName);
    }

    static appendLine(text: string, channelName: string = Log.DEFAULT_CHANNEL): void {
        Log.Instance().appendLine(text, channelName);
    }

    static clear(channelName: string = Log.DEFAULT_CHANNEL): void {
        Log.Instance().clear(channelName);
    }

    static dispose(channelName: string = Log.DEFAULT_CHANNEL): void {
        Log.Instance().dispose(channelName);
    }

    static hide(channelName: string = Log.DEFAULT_CHANNEL): void {
        Log.Instance().hide(channelName);
    }

    static show(channelName: string = Log.DEFAULT_CHANNEL): void {
        Log.Instance().show(channelName);
    }

    private channel(name: string = Log.DEFAULT_CHANNEL): LogOutputChannel {
        if (!this.channels[name]) {
            this.channels[name] = {
                out: vscode.window.createOutputChannel(name),
                lines: [],
                currentLineCursor: 0
            };
        }
        return this.channels[name];
    }

    private refreshLog(channel: LogOutputChannel): void {
        channel.out.clear();
        const n = channel.lines.length - 1;
        for (let i = 0; i < n; i++) {
            channel.out.appendLine(channel.lines[i]);
        }
        if (channel.currentLineCursor < channel.lines.length) {
            channel.out.append(channel.lines[n]);
        } else {
            channel.out.appendLine(channel.lines[n]);
        }
    }

    append(text: string, channelName: string = Log.DEFAULT_CHANNEL, line?: number): void {
        const channel = this.channel(channelName);

        const prevLength = channel.lines.length;
        line = (line !== undefined) ? line : channel.currentLineCursor;
        line = Math.max(0, Math.min(line, channel.currentLineCursor));

        if (line >= channel.lines.length) {
            channel.lines.push(text);
        } else {
            channel.lines[line] += text;
        }

        if (line < channel.currentLineCursor) {
            this.refreshLog(channel);
        } else {
            channel.out.append(text);
        }
    }

    insertLine(text: string, line: number, channelName: string = Log.DEFAULT_CHANNEL): void {
        const channel = this.channel(channelName);

        line = (line !== undefined) ? line : channel.currentLineCursor;
        line = Math.max(0, Math.min(line, channel.currentLineCursor));

        channel.lines.splice(line, 0, text);

        channel.currentLineCursor++;
        channel.currentLineCursor = Math.min(channel.currentLineCursor, channel.lines.length);

        if (line < channel.currentLineCursor - 1) {
            this.refreshLog(channel);
        } else {
            channel.out.appendLine(text);
        }
    }

    appendLine(text: string, channelName: string = Log.DEFAULT_CHANNEL): void {
        this.append(text, channelName);
        const channel = this.channel(channelName);
        channel.currentLineCursor++;
        channel.currentLineCursor = Math.min(channel.currentLineCursor, channel.lines.length);
    }

    clear(channelName: string = Log.DEFAULT_CHANNEL, ): void {
        const channel = this.channel(channelName);
        channel.lines = [];
        channel.out.clear();
    }

    dispose(channelName: string = Log.DEFAULT_CHANNEL, ): void {
        const channel = this.channel(channelName);
        channel.lines = undefined;
        channel.out.dispose();
    }

    hide(channelName: string = Log.DEFAULT_CHANNEL, ): void {
        const channel = this.channel(channelName);
        channel.out.hide();
    }

    show(channelName: string = Log.DEFAULT_CHANNEL, ): void {
        const channel = this.channel(channelName);
        channel.out.show();
    }
}