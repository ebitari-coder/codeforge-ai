import * as vscode from 'vscode';
import * as https from 'https';

export interface Model {
    id: string;
    name: string;
    context_length: number;
    description?: string;
    pricing?: {
        prompt: string;
        completion: string;
    };
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export class OpenRouterProvider {
    private currentModel: string;
    private isAutoMode: boolean;
    private apiKey: string;
    private availableModels: Model[] = [];

    constructor() {
        const config = vscode.workspace.getConfiguration('codeforge');
        this.currentModel = config.get<string>('defaultModel') || 'openai/gpt-oss-120b';
        this.isAutoMode = config.get<boolean>('autoModel') ?? true;
        this.apiKey = config.get<string>('apiKey') || '';
        this.refreshModels();
    }

    async refreshModels(): Promise<void> {
        try {
            const models = await this.fetchModels();
            // Filter for free models (pricing 0 for both prompt and completion)
            this.availableModels = models.filter(m => 
                m.pricing?.prompt === '0' && m.pricing?.completion === '0'
            );
        } catch (error) {
            console.error('Failed to fetch models:', error);
            // Fallback to a minimal list if fetch fails
            this.availableModels = [
                { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Free)', context_length: 131072 },
                { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (Free)', context_length: 262144 }
            ];
        }
    }

    private fetchModels(): Promise<Model[]> {
        return new Promise((resolve, reject) => {
            https.get('https://openrouter.ai/api/v1/models', (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(body);
                        resolve(response.data || []);
                    } catch (e) {
                        reject(new Error('Failed to parse models response'));
                    }
                });
            }).on('error', (e) => reject(e));
        });
    }

    async setAutoMode(enabled: boolean): Promise<void> {
        this.isAutoMode = enabled;
        await vscode.workspace.getConfiguration('codeforge').update('autoModel', enabled, true);
    }

    getAutoMode(): boolean {
        return this.isAutoMode;
    }

    async setCurrentModel(modelId: string): Promise<void> {
        this.currentModel = modelId;
        await vscode.workspace.getConfiguration('codeforge').update('defaultModel', modelId, true);
        // If user manually selects a model, disable auto mode
        if (this.isAutoMode) {
            await this.setAutoMode(false);
        }
    }

    getCurrentModel(agentType?: string): string {
        if (this.isAutoMode && agentType) {
            return this.getBestModelForAgent(agentType);
        }
        return this.currentModel;
    }

    private getBestModelForAgent(agentType: string): string {
        const mapping: Record<string, string> = {
            'planner': 'meta-llama/llama-3.3-70b-instruct:free',
            'coder': 'qwen/qwen3-coder-30b-instruct',
            'debugger': 'deepseek/deepseek-r1',
            'reviewer': 'openai/gpt-oss-120b',
            'explainer': 'google/gemma-4-31b-it:free'
        };
        return mapping[agentType] || this.currentModel;
    }

    getAvailableModels(): Model[] {
        return this.availableModels;
    }

    private getFallbackModels(currentModel: string): string[] {
        const allModels = this.availableModels.map(m => m.id);
        // Prioritize models that aren't the current one
        return allModels.filter(id => id !== currentModel);
    }

    async chat(messages: ChatMessage[], agentType?: string, onStream?: (chunk: string) => void): Promise<string> {
        const config = vscode.workspace.getConfiguration('codeforge');
        let model = this.getCurrentModel(agentType);
        const fallbacks = this.getFallbackModels(model);
        const modelsToTry = [model, ...fallbacks];
        
        let lastError: Error | null = null;

        for (const modelToTry of modelsToTry) {
            try {
                return await this.executeChat(modelToTry, messages, config, onStream);
            } catch (error: any) {
                lastError = error;
                const isRateLimit = error.message?.includes('429') || error.message?.toLowerCase().includes('limit');
                const isDown = error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503');

                if (isRateLimit || isDown) {
                    console.warn(`Model ${modelToTry} failed (${error.message}). Trying silent fallback...`);
                    continue;
                }
                throw error; // Rethrow if it's not a rate limit or server error
            }
        }

        throw lastError || new Error('All models failed to respond');
    }

    private executeChat(
        model: string, 
        messages: ChatMessage[], 
        config: vscode.WorkspaceConfiguration, 
        onStream?: (chunk: string) => void
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({
                model: model,
                messages: messages,
                max_tokens: config.get<number>('maxTokens') || 4096,
                temperature: config.get<number>('temperature') || 0.7,
                stream: !!onStream
            });

            const options = {
                hostname: 'openrouter.ai',
                path: '/api/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/codeforge-ai/codeforge-ai',
                    'X-Title': 'CodeForge AI'
                }
            };

            const req = https.request(options, (res) => {
                if (res.statusCode && (res.statusCode >= 400)) {
                    let errorData = '';
                    res.on('data', d => errorData += d);
                    res.on('end', () => {
                        reject(new Error(`API Error ${res.statusCode}: ${errorData}`));
                    });
                    return;
                }

                let fullResponse = '';
                
                if (onStream) {
                    res.on('data', (chunk) => {
                        const chunkStr = chunk.toString();
                        const lines = chunkStr.split('\n').filter((line: string) => line.trim() !== '');
                        for (const line of lines) {
                            if (line.includes('[DONE]')) return;
                            if (line.startsWith('data: ')) {
                                try {
                                    const json = JSON.parse(line.replace('data: ', ''));
                                    const content = json.choices[0]?.delta?.content || '';
                                    if (content) {
                                        fullResponse += content;
                                        onStream(content);
                                    }
                                } catch (e) {
                                    // Ignore partial JSON
                                }
                            }
                        }
                    });
                    res.on('end', () => resolve(fullResponse));
                } else {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => {
                        try {
                            const response = JSON.parse(body);
                            if (response.error) {
                                reject(new Error(response.error.message || 'Unknown AI error'));
                            } else {
                                resolve(response.choices[0].message.content);
                            }
                        } catch (e) {
                            reject(new Error('Failed to parse AI response'));
                        }
                    });
                }
            });

            req.on('error', (e) => reject(e));
            req.write(data);
            req.end();
        });
    }
}
