import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatMessage } from '../providers/OpenRouterProvider';

export class ContextManager {
    private historyFile: string | undefined;
    private maxHistory: number;

    constructor() {
        const config = vscode.workspace.getConfiguration('codeforge');
        this.maxHistory = config.get<number>('maxHistory') || 15;
        this.initWorkspace();
    }

    private initWorkspace() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const contextDir = path.join(workspaceFolder.uri.fsPath, '.codeforge');
            if (!fs.existsSync(contextDir)) {
                fs.mkdirSync(contextDir, { recursive: true });
            }
            this.historyFile = path.join(contextDir, 'history.json');
            
            // Add to .gitignore if it exists
            this.addToGitignore(workspaceFolder.uri.fsPath);
        }
    }

    private addToGitignore(workspacePath: string) {
        const gitignorePath = path.join(workspacePath, '.gitignore');
        const entry = '\n# CodeForge AI Context\n.codeforge/\n';
        
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            if (!content.includes('.codeforge/')) {
                fs.appendFileSync(gitignorePath, entry);
            }
        }
    }

    public saveHistory(messages: ChatMessage[]) {
        if (!this.historyFile) return;
        try {
            // Keep only the last N messages to prevent context bloat
            const historyToSave = messages.slice(-this.maxHistory);
            fs.writeFileSync(this.historyFile, JSON.stringify(historyToSave, null, 2));
        } catch (error) {
            console.error('Failed to save CodeForge history:', error);
        }
    }

    public loadHistory(): ChatMessage[] {
        if (!this.historyFile || !fs.existsSync(this.historyFile)) return [];
        try {
            const content = fs.readFileSync(this.historyFile, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to load CodeForge history:', error);
            return [];
        }
    }

    public clearHistory(): void {
        if (!this.historyFile) return;
        try {
            if (fs.existsSync(this.historyFile)) {
                fs.unlinkSync(this.historyFile);
            }
        } catch (error) {
            console.error('Failed to clear CodeForge history:', error);
        }
    }
}
