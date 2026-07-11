import * as vscode from 'vscode';
import { OpenRouterProvider } from './providers/OpenRouterProvider';
import { AgentManager, AgentType } from './agents/AgentManager';
import { ContextManager } from './utils/ContextManager';

export function registerCommands(
    context: vscode.ExtensionContext,
    provider: OpenRouterProvider,
    agentManager: AgentManager,
    contextManager: ContextManager
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.chat', async () => {
            vscode.commands.executeCommand('workbench.view.extension.codeforge-main-view');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.selectModel', async () => {
            const models = provider.getAvailableModels();
            const items = models.map(m => ({ label: m.name, description: m.id, detail: m.description }));
            const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select an AI model' });
            if (selected) {
                await provider.setCurrentModel(selected.description);
                vscode.window.showInformationMessage(`Model: ${selected.label}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.plan', async () => {
            const task = await vscode.window.showInputBox({ prompt: 'Describe your project', placeHolder: 'e.g., A task management app' });
            if (task) {
                const result = await agentManager.runAgent('planner', { task, workspaceUri: vscode.workspace.workspaceFolders?.[0]?.uri });
                vscode.window.showInformationMessage(result.message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.generate', async () => {
            const editor = vscode.window.activeTextEditor;
            const selection = editor?.document.getText(editor.selection);
            const task = await vscode.window.showInputBox({ prompt: 'What code to generate?', placeHolder: 'e.g., A function to sort array' });
            if (task) {
                const result = await agentManager.runAgent('coder', { selectedText: selection, task });
                vscode.window.showInformationMessage(result.message);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.review', async (range?: vscode.Range) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const text = range ? editor.document.getText(range) : (editor.document.getText(editor.selection) || editor.document.getText());
            const result = await agentManager.runAgent('reviewer', { selectedText: text });
            vscode.window.showInformationMessage(result.message);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.debug', async (range?: vscode.Range) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const text = range ? editor.document.getText(range) : (editor.document.getText(editor.selection) || editor.document.getText());
            const result = await agentManager.runAgent('debugger', { selectedText: text });
            vscode.window.showInformationMessage(result.message);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.explain', async (range?: vscode.Range) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const text = range ? editor.document.getText(range) : (editor.document.getText(editor.selection) || editor.document.getText());
            const result = await agentManager.runAgent('explainer', { selectedText: text });
            vscode.window.showInformationMessage(result.message);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeforge.clearHistory', async () => {
            contextManager.clearHistory();
            vscode.window.showInformationMessage('CodeForge AI: Chat history cleared');
        })
    );
}
