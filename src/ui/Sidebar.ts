import * as vscode from 'vscode';
import { OpenRouterProvider, ChatMessage } from '../providers/OpenRouterProvider';
import { AgentManager, AgentType } from '../agents/AgentManager';
import { ContextManager } from '../utils/ContextManager';

export class CodeForgeSidebar {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private provider: OpenRouterProvider;
    private agentManager: AgentManager;
    private contextManager: ContextManager;
    private chatHistory: ChatMessage[] = [];

    constructor(
        context: vscode.ExtensionContext,
        provider: OpenRouterProvider,
        agentManager: AgentManager,
        contextManager: ContextManager
    ) {
        this.context = context;
        this.provider = provider;
        this.agentManager = agentManager;
        this.contextManager = contextManager;
        this.chatHistory = this.contextManager.loadHistory();

        vscode.window.registerWebviewViewProvider(
            'codeforgeMain',
            this,
            { webviewOptions: { retainContextWhenHidden: true } }
        );
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.panel = webviewView as unknown as vscode.WebviewPanel;
        
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'refreshModels':
                    await this.provider.refreshModels();
                    webviewView.webview.postMessage({ 
                        type: 'updateModels', 
                        models: this.provider.getAvailableModels(),
                        currentModel: this.provider.getCurrentModel()
                    });
                    break;
                case 'selectModel':
                    await this.provider.setCurrentModel(message.model);
                    webviewView.webview.postMessage({ type: 'updateState', isAutoMode: this.provider.getAutoMode() });
                    break;
                case 'toggleAutoMode':
                    await this.provider.setAutoMode(message.enabled);
                    break;
                case 'runAgent':
                    await this.runAgent(message.agent, webviewView);
                    break;
                case 'saveChat':
                    this.chatHistory = message.history;
                    this.contextManager.saveHistory(this.chatHistory);
                    break;
                case 'clearHistory':
                    this.chatHistory = [];
                    this.contextManager.clearHistory();
                    webviewView.webview.postMessage({ type: 'historyCleared' });
                    break;
            }
        });
    }

    private async runAgent(agentType: string, webviewView: vscode.WebviewView): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        const selection = editor?.document.getText(editor.selection);

        const result = await this.agentManager.runAgent(
            agentType as AgentType,
            {
                selectedText: selection,
                task: agentType === 'planner' ? 'New Project' : undefined
            }
        );

        webviewView.webview.postMessage({ 
            type: 'agentComplete', 
            result,
            isAutoMode: this.provider.getAutoMode(),
            currentModel: this.provider.getCurrentModel(agentType)
        });
    }

    private getHtml(): string {
        const currentModel = this.provider.getCurrentModel();
        const isAutoMode = this.provider.getAutoMode();
        const models = this.provider.getAvailableModels();
        const optionsHtml = models.map(m => `<option value="${m.id}" ${m.id === currentModel ? 'selected' : ''}>${m.name}</option>`).join('');
        const initialHistory = JSON.stringify(this.chatHistory);

        return `<!DOCTYPE html>
<html>
<head>
    <script src="https://js.puter.com/v2/"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 16px; 
            background: #1e1e1e; 
            color: #d4d4d4;
        }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .header h2 { color: #569cd6; font-size: 18px; }
        .badge { background: #4CAF50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; }
        .auto-mode-container { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; background: #2d2d2d; padding: 8px; border-radius: 4px; border: 1px solid #444; }
        .auto-mode-label { font-size: 12px; display: flex; align-items: center; gap: 6px; }
        .switch { position: relative; display: inline-block; width: 34px; height: 20px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #444; transition: .4s; border-radius: 20px; }
        .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #569cd6; }
        input:checked + .slider:before { transform: translateX(14px); }
        .model-select { background: #2d2d2d; color: #d4d4d4; border: 1px solid #444; padding: 8px; border-radius: 4px; width: 100%; margin-bottom: 12px; }
        .model-select:disabled { opacity: 0.5; cursor: not-allowed; }
        .model-info { font-size: 11px; color: #858585; margin-bottom: 12px; padding: 8px; background: #2d2d2d; border-radius: 4px; }
        .model-info span { color: #4CAF50; }
        .tabs { display: flex; gap: 4px; margin-bottom: 12px; }
        .tab { padding: 8px 16px; background: #2d2d2d; border: none; color: #858585; cursor: pointer; border-radius: 4px; font-size: 12px; }
        .tab.active { background: #569cd6; color: #fff; }
        .chat-container { height: 280px; overflow-y: auto; background: #252526; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
        .message { margin-bottom: 10px; padding: 8px; border-radius: 6px; position: relative; }
        .message.user { background: #264f78; margin-left: 20%; }
        .message.assistant { background: #2d2d30; margin-right: 20%; }
        .message .role { font-size: 11px; color: #858585; margin-bottom: 4px; }
        .message .content { font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
        .input-container { display: flex; gap: 8px; }
        .chat-input { flex: 1; background: #2d2d2d; border: 1px solid #444; color: #d4d4d4; padding: 10px; border-radius: 6px; font-size: 13px; min-height: 50px; resize: none; }
        .chat-input:focus { outline: none; border-color: #569cd6; }
        .send-btn { background: #569cd6; border: none; color: #fff; padding: 10px 16px; border-radius: 6px; cursor: pointer; }
        .send-btn:hover { background: #4a8bc2; }
        .send-btn:disabled { background: #444; cursor: not-allowed; }
        .agent-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .agent-btn { padding: 16px; background: #2d2d2d; border: 1px solid #444; color: #d4d4d4; border-radius: 6px; cursor: pointer; text-align: center; transition: all 0.2s; }
        .agent-btn:hover { background: #3d3d3d; border-color: #569cd6; }
        .agent-btn .icon { font-size: 24px; display: block; margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <div><h2>🤖 CodeForge AI</h2><span class="badge">FREE</span></div>
        <div style="display: flex; gap: 4px;">
            <button class="tab" style="padding: 4px 8px;" onclick="refreshModels()" title="Refresh Models">🔄</button>
            <button class="tab" style="padding: 4px 8px;" onclick="clearChatHistory()" title="Clear History">🗑️</button>
        </div>
    </div>
    <div class="model-info">✨ <span>No API Key Required!</span> Using Puter.js</div>
    <div class="auto-mode-container">
        <div class="auto-mode-label">🚀 Auto Mode <span>(Best for task)</span></div>
        <label class="switch">
            <input type="checkbox" id="autoModeToggle" ${isAutoMode ? 'checked' : ''} onchange="toggleAutoMode()">
            <span class="slider"></span>
        </label>
    </div>
    <select class="model-select" id="modelSelect" onchange="changeModel()" ${isAutoMode ? 'disabled' : ''}>
        ${optionsHtml}
    </select>
    <div class="tabs">
        <button class="tab active" onclick="switchTab('chat')">💬 Chat</button>
        <button class="tab" onclick="switchTab('agents')">🤖 Agents</button>
    </div>
    <div id="chatTab">
        <div class="chat-container" id="chatContainer">
            <!-- Messages loaded via script -->
        </div>
        <div class="input-container">
            <textarea class="chat-input" id="chatInput" placeholder="Ask me anything..."></textarea>
            <button class="send-btn" id="sendBtn" onclick="sendMessage()">Send</button>
        </div>
    </div>
    <div id="agentsTab" style="display: none;">
        <div class="agent-buttons">
            <button class="agent-btn" onclick="runAgent('planner')"><span class="icon">📋</span>Plan Project</button>
            <button class="agent-btn" onclick="runAgent('coder')"><span class="icon">💻</span>Generate Code</button>
            <button class="agent-btn" onclick="runAgent('debugger')"><span class="icon">🔧</span>Debug & Fix</button>
            <button class="agent-btn" onclick="runAgent('reviewer')"><span class="icon">👀</span>Review Code</button>
            <button class="agent-btn" onclick="runAgent('explainer')"><span class="icon">💡</span>Explain Code</button>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let isLoading = false;
        let history = ${initialHistory};
        
        // Initial load of history
        const container = document.getElementById('chatContainer');
        if (history.length === 0) {
            addMessage('assistant', '👋 Hi! Select a model and start chatting - no API key needed!', false);
        } else {
            history.forEach(msg => addMessage(msg.role, msg.content, false));
        }

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('chatTab').style.display = tab === 'chat' ? 'block' : 'none';
            document.getElementById('agentsTab').style.display = tab === 'agents' ? 'block' : 'none';
        }
        
        function changeModel() {
            const model = document.getElementById('modelSelect').value;
            vscode.postMessage({ type: 'selectModel', model });
        }

        function refreshModels() {
            vscode.postMessage({ type: 'refreshModels' });
        }

        function clearChatHistory() {
            vscode.postMessage({ type: 'clearHistory' });
        }

        function toggleAutoMode() {
            const enabled = document.getElementById('autoModeToggle').checked;
            document.getElementById('modelSelect').disabled = enabled;
            vscode.postMessage({ type: 'toggleAutoMode', enabled });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateModels':
                    const select = document.getElementById('modelSelect');
                    const curModel = message.currentModel;
                    select.innerHTML = message.models.map(m => {
                        const isSelected = m.id === curModel ? 'selected' : '';
                        return '<option value="' + m.id + '" ' + isSelected + '>' + m.name + '</option>';
                    }).join('');
                    break;
                case 'updateState':
                    document.getElementById('autoModeToggle').checked = message.isAutoMode;
                    document.getElementById('modelSelect').disabled = message.isAutoMode;
                    break;
                case 'agentComplete':
                    if (message.isAutoMode && message.currentModel) {
                        document.getElementById('modelSelect').value = message.currentModel;
                    }
                    break;
                case 'historyCleared':
                    history = [];
                    document.getElementById('chatContainer').innerHTML = '';
                    addMessage('assistant', '👋 Chat history cleared. Start a new conversation!', false);
                    break;
            }
        });
        
        async function sendMessage() {
            if (isLoading) return;
            const input = document.getElementById('chatInput');
            const content = input.value.trim();
            if (!content) return;
            
            addMessage('user', content, true);
            input.value = '';
            isLoading = true;
            
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message assistant';
            loadingDiv.innerHTML = '<div class="content typing">🤔 Thinking...</div>';
            document.getElementById('chatContainer').appendChild(loadingDiv);
            document.getElementById('chatContainer').scrollTop = document.getElementById('chatContainer').scrollHeight;
            
            try {
                const model = document.getElementById('modelSelect').value;
                // Include history for context
                const chatMessages = history.map(m => ({ role: m.role, content: m.content }));
                const response = await puter.ai.chat(content, { 
                    model: model,
                    messages: chatMessages
                });
                loadingDiv.remove();
                addMessage('assistant', response, true);
            } catch (error) {
                loadingDiv.remove();
                addMessage('assistant', '❌ Error: ' + error.message, false);
            }
            isLoading = false;
        }
        
        function runAgent(agent) { vscode.postMessage({ type: 'runAgent', agent }); }
        
        function addMessage(role, content, shouldSave) {
            const container = document.getElementById('chatContainer');
            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.innerHTML = '<div class="role">' + (role === 'user' ? 'You' : 'CodeForge') + '</div><div class="content">' + content + '</div>';
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;

            if (shouldSave) {
                history.push({ role, content });
                vscode.postMessage({ type: 'saveChat', history: history });
            }
        }
        
        document.getElementById('chatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
    </script>
</body>
</html>`;
    }
}
