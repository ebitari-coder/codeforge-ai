import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OpenRouterProvider, ChatMessage } from '../providers/OpenRouterProvider';

export type AgentType = 'planner' | 'coder' | 'debugger' | 'reviewer' | 'explainer';

export interface AgentResult {
    success: boolean;
    message: string;
    artifacts?: any[];
}

export class AgentManager {
    private provider: OpenRouterProvider;

    constructor(provider: OpenRouterProvider) {
        this.provider = provider;
    }

    private async getAgentRules(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return '';
        
        const agentsMdPath = path.join(workspaceFolders[0].uri.fsPath, 'AGENTS.md');
        if (fs.existsSync(agentsMdPath)) {
            try {
                return fs.readFileSync(agentsMdPath, 'utf8');
            } catch (e) {
                console.error('Failed to read AGENTS.md', e);
            }
        }
        return '';
    }

    async runAgent(
        type: AgentType,
        context: {
            workspaceUri?: vscode.Uri;
            selectedText?: string;
            task?: string;
        }
    ): Promise<AgentResult> {
        const rules = await this.getAgentRules();
        const baseSystemPrompt = rules ? `Follow these AI Agent Operating Rules:\n${rules}\n\n` : '';

        const systemPrompts: Record<AgentType, string> = {
            planner: `${baseSystemPrompt}You are an expert software architect. Create detailed project plans with:
- Project Overview
- Tech Stack Recommendations  
- File Structure
- Implementation Steps
- Potential Challenges`,
            
            coder: `${baseSystemPrompt}You are an expert code generator. Write clean, production-ready code with:
- Best practices
- Error handling
- Documentation
- Type hints`,
            
            debugger: `${baseSystemPrompt}You are an expert debugger. Analyze code and provide:
- Issue identification
- Root cause analysis
- Prevention tips
- A FIXED version of the code inside a markdown code block starting with \`\`\`fixed\`\``,
            
            reviewer: `${baseSystemPrompt}You are an expert code reviewer. Provide:
- Summary
- Strengths
- Issues (severity: high/medium/low)
- Recommendations
- Rating (1-10)`,

            explainer: `${baseSystemPrompt}You are an expert technical educator. Explain the provided code clearly:
- High-level purpose
- Line-by-line or section-by-section breakdown
- Key concepts used
- Potential improvements for clarity`
        };

        try {
            let userPrompt = '';
            
            if (type === 'planner') {
                const workspaceTree = await this.getWorkspaceTree();
                userPrompt = `Plan this project: ${context.task}${workspaceTree ? `\n\nCurrent Project Structure:\n${workspaceTree}` : ''}`;
            } else if (type === 'coder') {
                userPrompt = `Generate code for: ${context.task}${context.selectedText ? `\nContext:\n${context.selectedText}` : ''}`;
            } else {
                userPrompt = `Analyze this code:\n\`\`\`\n${context.selectedText}\n\`\`\`\n${context.task ? `\nTask: ${context.task}` : ''}`;
            }

            if (type === 'planner' || type === 'coder') {
                const output = vscode.window.createOutputChannel(`CodeForge ${type}`);
                output.show();
                output.appendLine(`=== Generating ${type === 'planner' ? 'Plan' : 'Code'} ===\n`);

                const response = await this.provider.chat([
                    { role: 'system', content: systemPrompts[type] },
                    { role: 'user', content: userPrompt }
                ], type, (chunk) => {
                    output.append(chunk);
                });

                const doc = await vscode.workspace.openTextDocument({
                    content: response,
                    language: type === 'planner' ? 'markdown' : 'typescript'
                });
                await vscode.window.showTextDocument(doc);
            } else {
                const output = vscode.window.createOutputChannel(`CodeForge ${type}`);
                output.show();
                output.appendLine(`=== ${type.toUpperCase()} Analysis ===\n`);

                const response = await this.provider.chat([
                    { role: 'system', content: systemPrompts[type] },
                    { role: 'user', content: userPrompt }
                ], type, (chunk) => {
                    output.append(chunk);
                });

                if (type === 'debugger') {
                    this.handleDebuggerFix(response);
                }
            }

            return {
                success: true,
                message: `${type} completed successfully!`
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Error: ${error.message}`
            };
        }
    }

    private handleDebuggerFix(response: string) {
        const fixMatch = response.match(/```fixed\n([\s\S]*?)```/);
        if (fixMatch && fixMatch[1]) {
            const fixedCode = fixMatch[1].trim();
            vscode.window.showInformationMessage(
                '🛠️ CodeForge: Debugger found a fix. Apply it?',
                'Apply Fix',
                'View Fix'
            ).then(selection => {
                if (selection === 'Apply Fix') {
                    this.applyFix(fixedCode);
                } else if (selection === 'View Fix') {
                    vscode.workspace.openTextDocument({ content: fixedCode, language: 'typescript' })
                        .then(doc => vscode.window.showTextDocument(doc));
                }
            });
        }
    }

    private async applyFix(fixedCode: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        editor.edit(editBuilder => {
            if (editor.selection.isEmpty) {
                // Replace entire document if no selection
                const fullRange = new vscode.Range(
                    editor.document.positionAt(0),
                    editor.document.positionAt(editor.document.getText().length)
                );
                editBuilder.replace(fullRange, fixedCode);
            } else {
                editBuilder.replace(editor.selection, fixedCode);
            }
        });
    }

    private async getWorkspaceTree(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return '';

        let tree = '';
        for (const folder of workspaceFolders) {
            tree += `${folder.name}/\n`;
            const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'), '**/node_modules/**');
            files.slice(0, 50).forEach(file => { // Limit to 50 files for context
                const relativePath = path.relative(folder.uri.fsPath, file.fsPath);
                tree += `  ${relativePath}\n`;
            });
        }
        return tree;
    }

    getAgentNames(): Record<AgentType, string> {
        return {
            planner: 'Planning Agent',
            coder: 'Code Generation Agent',
            debugger: 'Debugging Agent',
            reviewer: 'Code Review Agent',
            explainer: 'Code Explanation Agent'
        };
    }
}
