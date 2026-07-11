import * as vscode from 'vscode';

export class CodeForgeCodeLensProvider implements vscode.CodeLensProvider {
    private codeLenses: vscode.CodeLens[] = [];
    private regex: RegExp;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        this.regex = /(function\s+\w+|const\s+\w+\s*=\s*(\([^)]*\)|[^=])\s*=>|class\s+\w+|def\s+\w+|fn\s+\w+|pub\s+fn\s+\w+|func\s+\w+|async\s+function\s+\w+)/g;

        vscode.workspace.onDidChangeConfiguration((_) => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        this.codeLenses = [];
        const text = document.getText();
        let matches;
        while ((matches = this.regex.exec(text)) !== null) {
            const line = document.lineAt(document.positionAt(matches.index).line);
            const indexOf = line.text.indexOf(matches[0]);
            const position = new vscode.Position(line.lineNumber, indexOf);
            const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
            if (range) {
                this.codeLenses.push(new vscode.CodeLens(range, {
                    title: "✨ Explain",
                    tooltip: "Explain this code using AI",
                    command: "codeforge.explain",
                    arguments: [range]
                }));
                this.codeLenses.push(new vscode.CodeLens(range, {
                    title: "🔍 Review",
                    tooltip: "Review this code using AI",
                    command: "codeforge.review",
                    arguments: [range]
                }));
            }
        }
        return this.codeLenses;
    }
}
