import * as vscode from 'vscode';

export class Logger {
    private name: string;
    private output: vscode.OutputChannel;

    constructor(name: string) {
        this.name = name;
        this.output = vscode.window.createOutputChannel(name);
    }

    info(message: string): void { this.log('INFO', message); }
    warn(message: string): void { this.log('WARN', message); }
    error(message: string, error?: Error): void { this.log('ERROR', message); if (error?.stack) this.output.appendLine(error.stack); }

    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        this.output.appendLine(`[${timestamp}] [${level}] ${message}`);
    }

    show(): void { this.output.show(); }
}
