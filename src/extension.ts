import * as vscode from 'vscode';
import { OpenRouterProvider } from './providers/OpenRouterProvider';
import { AgentManager } from './agents/AgentManager';
import { CodeForgeSidebar } from './ui/Sidebar';
import { CodeForgeCodeLensProvider } from './ui/CodeLensProvider';
import { ContextManager } from './utils/ContextManager';
import { registerCommands } from './commands';
import { Logger } from './utils/logger';

export let openRouterProvider: OpenRouterProvider;
export let agentManager: AgentManager;
export let sidebar: CodeForgeSidebar;
export let logger: Logger;
export let contextManager: ContextManager;

export async function activate(context: vscode.ExtensionContext) {
    logger = new Logger('CodeForge AI');
    logger.info('CodeForge AI starting...');
    
    contextManager = new ContextManager();

    vscode.window.showInformationMessage(
        '🤖 CodeForge AI: Advanced AI Agents Ready!',
        'Get Started'
    ).then(selection => {
        if (selection === 'Get Started') {
            vscode.commands.executeCommand('codeforge.chat');
        }
    });

    openRouterProvider = new OpenRouterProvider();
    agentManager = new AgentManager(openRouterProvider);
    sidebar = new CodeForgeSidebar(context, openRouterProvider, agentManager, contextManager);
    
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'typescript', scheme: 'file' },
            new CodeForgeCodeLensProvider()
        ),
        vscode.languages.registerCodeLensProvider(
            { language: 'javascript', scheme: 'file' },
            new CodeForgeCodeLensProvider()
        ),
        vscode.languages.registerCodeLensProvider(
            { language: 'python', scheme: 'file' },
            new CodeForgeCodeLensProvider()
        ),
        vscode.languages.registerCodeLensProvider(
            { language: 'rust', scheme: 'file' },
            new CodeForgeCodeLensProvider()
        ),
        vscode.languages.registerCodeLensProvider(
            { language: 'go', scheme: 'file' },
            new CodeForgeCodeLensProvider()
        ),
        vscode.languages.registerCodeLensProvider(
            { language: 'java', scheme: 'file' },
            new CodeForgeCodeLensProvider()
        )
    );

    registerCommands(context, openRouterProvider, agentManager, contextManager);
    
    logger.info('CodeForge AI activated successfully!');
}

export function deactivate() {
    logger?.info('CodeForge AI deactivated');
}
