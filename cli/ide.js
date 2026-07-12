#!/usr/bin/env node

const blessed = require('blessed');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const VERSION = '1.0.0';
const CONFIG_DIR = path.join(require('os').homedir(), '.codeforge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');

const DEFAULT_CONFIG = {
  provider: 'openrouter',
  apiKey: '',
  defaultModel: 'openai/gpt-oss-120b',
  autoMode: true,
  maxTokens: 4096,
  temperature: 0.7,
  maxHistory: 50,
  theme: 'default'
};

const AGENT_MODELS = {
  planner: 'meta-llama/llama-3.3-70b-instruct:free',
  coder: 'qwen/qwen3-coder-30b-instruct',
  debugger: 'deepseek/deepseek-r1',
  reviewer: 'openai/gpt-oss-120b',
  explainer: 'google/gemma-4-31b-it:free',
  auto: null
};

const SYSTEM_PROMPTS = {
  default: `You are CodeForge AI, an expert coding assistant embedded in the user's terminal.
When you need to read a file, respond with: [READ: filepath]
When you need to list a directory, respond with: [LIST: dirpath]
When you need to search for files, respond with: [SEARCH: pattern]
Always provide clean, production-ready code with best practices.`,
  planner: `You are an expert software architect. Analyze the workspace and create detailed project plans.
When you need to read a file, respond with: [READ: filepath]
When you need to list a directory, respond with: [LIST: dirpath]`,
  coder: `You are an expert code generator. Write clean, production-ready code.
When you need to read existing code for context, respond with: [READ: filepath]`,
  debugger: `You are an expert debugger. Analyze code and provide fixes.
When you need to read files to debug, respond with: [READ: filepath]`,
  reviewer: `You are an expert code reviewer. Analyze code and provide ratings.
When you need to read files for review, respond with: [READ: filepath]`,
  explainer: `You are an expert technical educator. Explain code clearly.
When you need to read files to explain, respond with: [READ: filepath]`
};

// ═══════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════

function ensureDirs() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function loadConfig() {
  ensureDirs();
  if (fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function getSessionDir(sessionId) {
  const dir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function loadSession(sessionId) {
  const file = path.join(getSessionDir(sessionId), 'messages.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return [];
}

function saveSession(sessionId, messages) {
  const file = path.join(getSessionDir(sessionId), 'messages.json');
  fs.writeFileSync(file, JSON.stringify(messages, null, 2));
}

function getSessionMeta(sessionId) {
  const file = path.join(getSessionDir(sessionId), 'meta.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return null;
}

function saveSessionMeta(sessionId, meta) {
  const file = path.join(getSessionDir(sessionId), 'meta.json');
  fs.writeFileSync(file, JSON.stringify(meta, null, 2));
}

// ═══════════════════════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════════════════════

function chat(messages, model, apiKey, config, onStream) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: model || config.defaultModel,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: !!onStream
    });

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || config.apiKey}`,
        'HTTP-Referer': 'https://github.com/codeforge-ai/codeforge-ai',
        'X-Title': 'CodeForge AI CLI'
      }
    };

    const req = https.request(options, (res) => {
      let fullResponse = '';

      if (onStream) {
        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(l => l.trim());
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
              } catch (e) {}
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
              reject(new Error(response.error.message || 'API error'));
            } else {
              const content = response.choices[0].message.content;
              const tokens = response.usage?.total_tokens || 0;
              resolve({ content, tokens, model: response.model });
            }
          } catch (e) {
            reject(new Error('Failed to parse response'));
          }
        });
      }
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════
// File Tree Builder
// ═══════════════════════════════════════════════════════════

class FileTreeBuilder {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.ignoredDirs = new Set(['node_modules', '__pycache__', 'target', 'dist', '.git', '.codeforge', 'venv', '.venv']);
  }

  build() {
    return this.walk(this.rootDir, 0);
  }

  walk(dir, depth) {
    if (depth > 6) return [];
    let items = [];
    try {
      const entries = fs.readdirSync(dir)
        .filter(f => !f.startsWith('.') || f === '.env.example' || f === '.gitignore')
        .filter(f => !this.ignoredDirs.has(f))
        .sort((a, b) => {
          const aIsDir = fs.statSync(path.join(dir, a)).isDirectory();
          const bIsDir = fs.statSync(path.join(dir, b)).isDirectory();
          return aIsDir === bIsDir ? a.localeCompare(b) : aIsDir ? -1 : 1;
        });

      for (const entry of entries.slice(0, 50)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        const relPath = path.relative(this.rootDir, fullPath);

        if (stat.isDirectory()) {
          items.push({
            name: entry,
            path: relPath,
            isDir: true,
            depth,
            children: this.walk(fullPath, depth + 1)
          });
        } else {
          items.push({
            name: entry,
            path: relPath,
            isDir: false,
            depth,
            size: stat.size
          });
        }
      }
    } catch (e) {}
    return items;
  }

  flatten(items, expanded, depth = 0) {
    let result = [];
    for (const item of items) {
      result.push(item);
      if (item.isDir && expanded.has(item.path)) {
        result = result.concat(this.flatten(item.children, expanded, depth + 1));
      }
    }
    return result;
  }
}

// ═══════════════════════════════════════════════════════════
// Syntax Highlighter (simple)
// ═══════════════════════════════════════════════════════════

const SYNTAX_RULES = {
  js: [
    { pattern: /(\/\/.*$)/gm, color: 'gray' },
    { pattern: /(\/\*[\s\S]*?\*\/)/g, color: 'gray' },
    { pattern: /('.*?'|".*?"|`.*?`)/g, color: 'green' },
    { pattern: /\b(const|let|var|function|return|if|else|for|while|class|extends|import|export|from|async|await|new|this|try|catch|throw|switch|case|break|default|typeof|instanceof)\b/g, color: 'magenta' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, color: 'cyan' },
    { pattern: /\b(\d+\.?\d*)\b/g, color: 'yellow' },
  ],
  ts: null,
  py: [
    { pattern: /(#.*$)/gm, color: 'gray' },
    { pattern: /('.*?'|".*?")/g, color: 'green' },
    { pattern: /\b(def|class|return|if|else|for|while|import|from|as|try|except|raise|with|lambda|yield|pass|break|continue|and|or|not|is|in|True|False|None|self)\b/g, color: 'magenta' },
    { pattern: /\b(\d+\.?\d*)\b/g, color: 'yellow' },
  ]
};
SYNTAX_RULES.ts = SYNTAX_RULES.js;

function highlightLine(line, lang) {
  const rules = SYNTAX_RULES[lang] || SYNTAX_RULES.js;
  if (!rules) return line;

  let segments = [{ text: line, applied: false }];

  for (const rule of rules) {
    const newSegments = [];
    for (const seg of segments) {
      if (seg.applied) { newSegments.push(seg); continue; }
      let lastIndex = 0;
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match;
      while ((match = regex.exec(seg.text)) !== null) {
        if (match.index > lastIndex) {
          newSegments.push({ text: seg.text.slice(lastIndex, match.index), applied: false });
        }
        newSegments.push({ text: match[0], color: rule.color, applied: true });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < seg.text.length) {
        newSegments.push({ text: seg.text.slice(lastIndex), applied: false });
      }
    }
    segments = newSegments;
  }

  return segments.map(s => {
    if (s.color) return chalk[s.color](s.text);
    return s.text;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// IDE Application
// ═══════════════════════════════════════════════════════════

class CodeForgeIDE {
  constructor(options = {}) {
    this.config = loadConfig();
    this.rootDir = options.cwd || process.cwd();
    this.fileTree = new FileTreeBuilder(this.rootDir);
    this.expandedDirs = new Set([path.basename(this.rootDir)]);
    this.selectedFile = null;
    this.fileContent = '';
    this.messages = [];
    this.currentAgent = options.agent || 'default';
    this.currentModel = options.model || this.config.defaultModel;
    this.sessionId = options.session || generateId();
    this.streaming = false;
    this.focusedPanel = 'chat'; // 'tree', 'code', 'chat'
    this.chatScroll = 0;
    this.codeScroll = 0;

    if (options.continue) {
      const last = this.getLastSession();
      if (last) {
        this.sessionId = last.id;
        this.messages = loadSession(this.sessionId);
        this.currentModel = last.model || this.currentModel;
        this.currentAgent = last.agent || this.currentAgent;
      }
    }
  }

  getLastSession() {
    ensureDirs();
    const dirs = fs.readdirSync(SESSIONS_DIR).filter(d => {
      const meta = getSessionMeta(d);
      return meta !== null;
    }).map(d => ({
      id: d,
      ...getSessionMeta(d)
    })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return dirs.length > 0 ? dirs[0] : null;
  }

  saveSessionState() {
    saveSession(this.sessionId, this.messages);
    saveSessionMeta(this.sessionId, {
      id: this.sessionId,
      model: this.currentModel,
      agent: this.currentAgent,
      createdAt: getSessionMeta(this.sessionId)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: this.messages.length
    });
  }

  getLang(filename) {
    const ext = path.extname(filename).slice(1).toLowerCase();
    const map = { js: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', py: 'py', rb: 'py', go: 'py', rs: 'py', java: 'py', c: 'py', cpp: 'py', h: 'py', css: 'js', html: 'js', json: 'js', md: 'py', sh: 'py' };
    return map[ext] || null;
  }

  start() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: `CodeForge AI v${VERSION}`,
      fullUnicode: true
    });

    this.buildLayout();
    this.bindKeys();
    this.refreshFileTree();
    this.updateStatusBar();
    this.renderChatHistory();

    this.screen.render();
  }

  buildLayout() {
    // Main container
    this.layout = blessed.box({
      parent: this.screen,
      width: '100%',
      height: '100%',
      style: { bg: '#1a1b26' }
    });

    // ─── Top Bar ───
    this.topBar = blessed.box({
      parent: this.layout,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      style: { bg: '#7aa2f7', fg: '#1a1b26', bold: true },
      content: `{center} CodeForge AI  v${VERSION} {/center}`
    });

    // ─── Main Content Area ───
    this.mainArea = blessed.box({
      parent: this.layout,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-4',
      layout: 'horizontal'
    });

    // ─── File Tree Panel (Left) ───
    this.treePanel = blessed.box({
      parent: this.mainArea,
      left: 0,
      width: '25%',
      height: '100%',
      border: { type: 'line' },
      label: ' Files ',
      tags: true,
      style: {
        border: { fg: '#414868' },
        label: { fg: '#7aa2f7', bold: true },
        bg: '#1a1b26'
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { style: { bg: '#414868' } },
      keys: true,
      mouse: true
    });

    // ─── Code Viewer Panel (Center) ───
    this.codePanel = blessed.box({
      parent: this.mainArea,
      left: '25%',
      width: '40%',
      height: '100%',
      border: { type: 'line' },
      label: ' Code ',
      tags: true,
      style: {
        border: { fg: '#414868' },
        label: { fg: '#9ece6a', bold: true },
        bg: '#1a1b26'
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { style: { bg: '#414868' } },
      keys: true,
      mouse: true
    });

    // ─── Chat Panel (Right) ───
    this.chatPanel = blessed.box({
      parent: this.mainArea,
      left: '65%',
      width: '35%',
      height: '100%-1',
      border: { type: 'line' },
      label: ' AI Chat ',
      tags: true,
      style: {
        border: { fg: '#414868' },
        label: { fg: '#bb9af7', bold: true },
        bg: '#1a1b26'
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { style: { bg: '#414868' } },
      keys: true,
      mouse: true
    });

    // ─── Input Bar ───
    this.inputBox = blessed.box({
      parent: this.layout,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      label: ' Input ',
      tags: true,
      style: {
        border: { fg: '#bb9af7' },
        label: { fg: '#bb9af7', bold: true },
        bg: '#1a1b26'
      }
    });

    this.inputField = blessed.textarea({
      parent: this.inputBox,
      top: 0,
      left: 1,
      width: '100%-2',
      height: 1,
      inputOnFocus: true,
      style: {
        fg: '#c0caf5',
        bg: '#1a1b26',
        focus: { bg: '#1a1b26' }
      },
      keys: true,
      mouse: true
    });

    // ─── Status Bar (Bottom) ───
    this.statusBar = blessed.box({
      parent: this.layout,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: { bg: '#414868', fg: '#c0caf5' }
    });

    // Set initial focus to input
    this.inputField.focus();
  }

  bindKeys() {
    // Global keys
    this.screen.key(['escape'], () => {
      if (this.streaming) return;
      this.inputField.focus();
      this.focusedPanel = 'chat';
      this.screen.render();
    });

    this.screen.key(['tab'], () => {
      if (this.streaming) return;
      const panels = ['tree', 'code', 'chat'];
      const idx = panels.indexOf(this.focusedPanel);
      this.focusedPanel = panels[(idx + 1) % panels.length];
      this.focusPanel(this.focusedPanel);
      this.screen.render();
    });

    // Ctrl+Q to quit
    this.screen.key(['C-q'], () => {
      this.saveSessionState();
      process.exit(0);
    });

    // Ctrl+S to save session
    this.screen.key(['C-s'], () => {
      this.saveSessionState();
      this.showNotification('Session saved');
    });

    // Ctrl+L to clear chat
    this.screen.key(['C-l'], () => {
      this.messages = [];
      this.renderChatHistory();
      this.screen.render();
    });

    // Ctrl+E to export
    this.screen.key(['C-e'], () => {
      const exportFile = path.join(CONFIG_DIR, `export-${this.sessionId}.json`);
      fs.writeFileSync(exportFile, JSON.stringify({ sessionId: this.sessionId, messages: this.messages }, null, 2));
      this.showNotification(`Exported to ${exportFile}`);
    });

    // Tree navigation
    this.treePanel.key(['enter', 'return'], () => {
      this.handleTreeSelect();
    });

    this.treePanel.key(['space'], () => {
      this.handleTreeToggle();
    });

    // Input submission
    this.inputField.key(['enter'], (ch, key) => {
      if (key.ctrl) {
        // Ctrl+Enter = newline in input
        return;
      }
      this.handleSubmit();
    });

    // Panel-specific scrolling
    this.treePanel.key(['up', 'k'], () => {
      this.treePanel.scroll(-1);
      this.screen.render();
    });
    this.treePanel.key(['down', 'j'], () => {
      this.treePanel.scroll(1);
      this.screen.render();
    });

    this.codePanel.key(['up', 'k'], () => {
      this.codePanel.scroll(-1);
      this.screen.render();
    });
    this.codePanel.key(['down', 'j'], () => {
      this.codePanel.scroll(1);
      this.screen.render();
    });

    this.chatPanel.key(['up', 'k'], () => {
      this.chatPanel.scroll(-1);
      this.screen.render();
    });
    this.chatPanel.key(['down', 'j'], () => {
      this.chatPanel.scroll(1);
      this.screen.render();
    });

    // Focus switching with number keys
    this.screen.key(['1'], () => { this.focusPanel('tree'); });
    this.screen.key(['2'], () => { this.focusPanel('code'); });
    this.screen.key(['3'], () => { this.focusPanel('chat'); });

    // Agent quick-switch
    this.screen.key(['C-1'], () => { this.switchAgent('planner'); });
    this.screen.key(['C-2'], () => { this.switchAgent('coder'); });
    this.screen.key(['C-3'], () => { this.switchAgent('debugger'); });
    this.screen.key(['C-4'], () => { this.switchAgent('reviewer'); });
    this.screen.key(['C-5'], () => { this.switchAgent('explainer'); });
  }

  focusPanel(panel) {
    this.focusedPanel = panel;

    // Reset all borders
    this.treePanel.options.style.border = { fg: '#414868' };
    this.codePanel.options.style.border = { fg: '#414868' };
    this.chatPanel.options.style.border = { fg: '#414868' };

    // Highlight focused
    const colors = { tree: '#7aa2f7', code: '#9ece6a', chat: '#bb9af7' };
    const labels = { tree: ' Files ', code: ' Code ', chat: ' AI Chat ' };

    this.treePanel.options.style.border = { fg: panel === 'tree' ? colors.tree : '#414868' };
    this.treePanel.options.label = panel === 'tree' ? '{bold}▶ Files{/bold}' : labels.tree;

    this.codePanel.options.style.border = { fg: panel === 'code' ? colors.code : '#414868' };
    this.codePanel.options.label = panel === 'code' ? '{bold}▶ Code{/bold}' : labels.code;

    this.chatPanel.options.style.border = { fg: panel === 'chat' ? colors.chat : '#414868' };
    this.chatPanel.options.label = panel === 'chat' ? '{bold}▶ AI Chat{/bold}' : labels.chat;

    // Focus the widget
    if (panel === 'tree') this.treePanel.focus();
    else if (panel === 'code') this.codePanel.focus();
    else if (panel === 'chat') this.chatPanel.focus();

    this.updateStatusBar();
    this.screen.render();
  }

  refreshFileTree() {
    const tree = this.fileTree.build();
    const flat = this.fileTree.flatten(tree, this.expandedDirs);

    let content = '';
    for (const item of flat) {
      const indent = '  '.repeat(item.depth);
      const icon = item.isDir
        ? (this.expandedDirs.has(item.path) ? '{#7aa2f7-fg}▼{/}' : '{#7aa2f7-fg}▶{/}')
        : this.getFileIcon(item.name);
      const name = item.isDir
        ? `{bold}{#7aa2f7-fg}${item.name}{/bold}{/}`
        : item.name;

      content += `${indent}${icon} ${name}\n`;
    }

    this.treePanel.setContent(content);
    this.screen.render();
  }

  getFileIcon(filename) {
    const ext = path.extname(filename).toLowerCase();
    const icons = {
      '.js': '{#f0c674-fg}◆{/}',
      '.ts': '{#569cd6-fg}◆{/}',
      '.jsx': '{#61dafb-fg}◇{/}',
      '.tsx': '{#61dafb-fg}◇{/}',
      '.py': '{#9ece6a-fg}◆{/}',
      '.json': '{#f0c674-fg}◇{/}',
      '.md': '{#c0caf5-fg}◇{/}',
      '.css': '{#bb9af7-fg}◇{/}',
      '.html': '{#e06c75-fg}◇{/}',
      '.yml': '{#e06c75-fg}◇{/}',
      '.yaml': '{#e06c75-fg}◇{/}',
      '.sh': '{#9ece6a-fg}◇{/}',
      '.lock': '{#565f89-fg}◇{/}',
    };
    return icons[ext] || '{#565f89-fg}◇{/}';
  }

  handleTreeSelect() {
    const selectedIdx = this.treePanel.getScroll();
    const tree = this.fileTree.build();
    const flat = this.fileTree.flatten(tree, this.expandedDirs);

    if (selectedIdx >= 0 && selectedIdx < flat.length) {
      const item = flat[selectedIdx];
      if (item.isDir) {
        this.handleTreeToggle();
      } else {
        this.openFile(item.path);
      }
    }
  }

  handleTreeToggle() {
    const selectedIdx = this.treePanel.getScroll();
    const tree = this.fileTree.build();
    const flat = this.fileTree.flatten(tree, this.expandedDirs);

    if (selectedIdx >= 0 && selectedIdx < flat.length) {
      const item = flat[selectedIdx];
      if (item.isDir) {
        if (this.expandedDirs.has(item.path)) {
          this.expandedDirs.delete(item.path);
          // Also collapse children
          for (const key of this.expandedDirs) {
            if (key.startsWith(item.path + path.sep)) {
              this.expandedDirs.delete(key);
            }
          }
        } else {
          this.expandedDirs.add(item.path);
        }
        this.refreshFileTree();
      } else {
        this.openFile(item.path);
      }
    }
  }

  openFile(relPath) {
    const fullPath = path.join(this.rootDir, relPath);
    if (!fs.existsSync(fullPath)) return;

    const stat = fs.statSync(fullPath);
    if (stat.size > 200 * 1024) {
      this.codePanel.setContent(`{gray-fg}File too large: ${(stat.size / 1024).toFixed(1)}KB{/}`);
      this.codePanel.options.label = ` Code - ${relPath} `;
      this.screen.render();
      return;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      this.selectedFile = relPath;
      const lang = this.getLang(relPath);

      // Add line numbers and syntax highlighting
      const lines = content.split('\n');
      let display = '';
      const maxLineNum = lines.length;
      const numWidth = String(maxLineNum).length;

      for (let i = 0; i < lines.length; i++) {
        const lineNum = String(i + 1).padStart(numWidth, ' ');
        const highlighted = lang ? highlightLine(lines[i], lang) : lines[i];
        display += `{#565f89-fg}${lineNum}{/} ${highlighted}\n`;
      }

      this.codePanel.setContent(display);
      this.codePanel.options.label = ` Code - ${relPath} `;
      this.codePanel.setScrollPerc(0);
    } catch (e) {
      this.codePanel.setContent(`{red-fg}Error reading file: ${e.message}{/}`);
    }
    this.screen.render();
  }

  renderChatHistory() {
    let content = '';

    if (this.messages.length === 0) {
      content = `\n{center}{gray-fg}Welcome to CodeForge AI{/gray-fg}

{center}Type a message below to start chatting.{/center}

{center}{gray-fg}Keybindings:{/gray-fg}
{center}{gray-fg}Tab       - Switch panels{/gray-fg}
{center}{gray-fg}Ctrl+Q    - Quit{/gray-fg}
{center}{gray-fg}Ctrl+S    - Save session{/gray-fg}
{center}{gray-fg}Ctrl+L    - Clear chat{/gray-fg}
{center}{gray-fg}@agent    - Switch agent in message{/gray-fg}
{center}{gray-fg}/help     - Show commands{/center}{/center}
`;
    } else {
      for (const msg of this.messages) {
        if (msg.role === 'user') {
          content += `{#bb9af7-fg}▸ You:{/} ${this.truncateMsg(msg.content)}\n`;
        } else {
          content += `{#9ece6a-fg}▸ AI:{/} ${this.truncateMsg(msg.content)}\n`;
        }
        content += '\n';
      }
    }

    this.chatPanel.setContent(content);

    // Auto-scroll to bottom
    if (this.messages.length > 0) {
      this.chatPanel.setScrollPerc(100);
    }

    this.screen.render();
  }

  truncateMsg(msg) {
    if (!msg) return '';
    // Don't truncate, but limit display
    return msg.replace(/\n/g, ' ').slice(0, 500);
  }

  async handleSubmit() {
    const input = this.inputField.getValue().trim();
    if (!input || this.streaming) return;

    this.inputField.clearValue();

    // Handle commands
    if (input.startsWith('/')) {
      await this.handleCommand(input);
      this.screen.render();
      return;
    }

    // Handle @agent switching
    let userMessage = input;
    const agentMatch = input.match(/^@(\w+)\s+(.*)/);
    if (agentMatch) {
      this.switchAgent(agentMatch[1]);
      userMessage = agentMatch[2];
    }

    // Add user message
    this.messages.push({ role: 'user', content: userMessage });
    this.renderChatHistory();

    // Build API messages
    const basePrompt = SYSTEM_PROMPTS[this.currentAgent] || SYSTEM_PROMPTS.default;
    const workspaceContext = this.getWorkspaceContext();
    const systemPrompt = `${basePrompt}\n\n${workspaceContext}`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...this.messages.slice(-this.config.maxHistory)
    ];

    // Determine model
    let useModel = this.currentModel;
    if (this.config.autoMode && AGENT_MODELS[this.currentAgent]) {
      useModel = AGENT_MODELS[this.currentAgent] || this.currentModel;
    }

    this.streaming = true;
    this.updateStatusBar();

    try {
      let responseText = '';
      await chat(apiMessages, useModel, this.config.apiKey, this.config, (chunk) => {
        responseText += chunk;
        // Update chat panel with streaming
        const lastMsg = this.messages[this.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant-streaming') {
          lastMsg.content = responseText;
        } else {
          this.messages.push({ role: 'assistant-streaming', content: responseText });
        }
        this.renderChatHistory();
      });

      // Finalize - replace streaming message with final
      this.messages = this.messages.filter(m => m.role !== 'assistant-streaming');
      this.messages.push({ role: 'assistant', content: responseText });

      this.streaming = false;
      this.renderChatHistory();
      this.saveSessionState();
    } catch (error) {
      this.streaming = false;
      this.messages = this.messages.filter(m => m.role !== 'assistant-streaming');
      this.messages.push({ role: 'assistant', content: `Error: ${error.message}` });
      this.renderChatHistory();
    }

    this.screen.render();
  }

  async handleCommand(input) {
    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case '/help':
        this.messages.push({ role: 'assistant', content: this.getHelpText() });
        break;

      case '/clear':
        this.messages = [];
        break;

      case '/model':
        if (parts[1]) {
          this.currentModel = parts[1];
          this.saveSessionState();
          this.messages.push({ role: 'assistant', content: `Model: ${this.currentModel}` });
        } else {
          this.messages.push({ role: 'assistant', content: `Current model: ${this.currentModel}` });
        }
        break;

      case '/agent':
        if (parts[1]) {
          this.switchAgent(parts[1]);
          this.messages.push({ role: 'assistant', content: `Agent: ${this.currentAgent}` });
        } else {
          this.messages.push({ role: 'assistant', content: `Current agent: ${this.currentAgent}\nAvailable: ${Object.keys(SYSTEM_PROMPTS).join(', ')}` });
        }
        break;

      case '/auto':
        this.config.autoMode = !this.config.autoMode;
        saveConfig(this.config);
        this.messages.push({ role: 'assistant', content: `Auto mode: ${this.config.autoMode ? 'ON' : 'OFF'}` });
        break;

      case '/sessions':
        ensureDirs();
        const sessions = fs.readdirSync(SESSIONS_DIR).filter(d => getSessionMeta(d) !== null).map(d => ({
          id: d,
          ...getSessionMeta(d)
        })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (sessions.length === 0) {
          this.messages.push({ role: 'assistant', content: 'No sessions found.' });
        } else {
          const list = sessions.map(s =>
            `${s.id === this.sessionId ? '→ ' : '  '}${s.id} | ${s.model} | ${s.messageCount || 0} msgs`
          ).join('\n');
          this.messages.push({ role: 'assistant', content: `Sessions:\n${list}` });
        }
        break;

      case '/pwd':
        this.messages.push({ role: 'assistant', content: this.rootDir });
        break;

      case '/stats':
        const statsFile = path.join(CONFIG_DIR, 'stats.json');
        const stats = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile, 'utf8')) : { requests: 0, totalTokens: 0 };
        this.messages.push({ role: 'assistant', content: `Requests: ${stats.requests}\nTokens: ${(stats.totalTokens || 0).toLocaleString()}` });
        break;

      case '/quit':
      case '/exit':
        this.saveSessionState();
        process.exit(0);

      default:
        this.messages.push({ role: 'assistant', content: `Unknown command: ${cmd}. Type /help for available commands.` });
    }

    this.renderChatHistory();
  }

  getHelpText() {
    return `Commands:
/help              Show this help
/clear             Clear current session
/model <model>     Switch model
/agent <agent>     Switch agent (planner/coder/debugger/reviewer/explainer)
/auto              Toggle auto mode
/sessions          List all sessions
/pwd               Show workspace path
/stats             Show usage statistics
/quit              Exit

Keybindings:
Tab            Switch panels (Tree → Code → Chat)
1/2/3          Focus specific panel
Ctrl+1..5      Quick-switch agent
Ctrl+S         Save session
Ctrl+L         Clear chat
Ctrl+Q         Quit
@agent         Switch agent in message (e.g. @coder write a function)`;
  }

  switchAgent(agent) {
    if (SYSTEM_PROMPTS[agent]) {
      this.currentAgent = agent;
      this.saveSessionState();
      this.updateStatusBar();
    }
  }

  getWorkspaceContext() {
    let context = `Current workspace: ${this.rootDir}\n`;

    const pkgPath = path.join(this.rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        context += `Project: ${pkg.name || path.basename(this.rootDir)}\n`;
        if (pkg.description) context += `Description: ${pkg.description}\n`;
        if (pkg.dependencies) context += `Dependencies: ${Object.keys(pkg.dependencies).slice(0, 15).join(', ')}\n`;
      } catch (e) {}
    }

    // Add file tree
    const tree = this.fileTree.build();
    const flat = this.fileTree.flatten(tree, new Set([path.basename(this.rootDir)]));
    const treeStr = flat.slice(0, 30).map(item => {
      const indent = '  '.repeat(item.depth);
      return `${indent}${item.isDir ? item.name + '/' : item.name}`;
    }).join('\n');
    context += `\nProject structure:\n${treeStr}`;

    return context;
  }

  updateStatusBar() {
    const agent = `{#bb9af7-fg}Agent: {/bold}{white-fg}${this.currentAgent}{/} {/bold}`;
    const model = `{#9ece6a-fg}Model: {/bold}{white-fg}${this.currentModel.split('/').pop()}{/} {/bold}`;
    const dir = `{#f0c674-fg}Dir: {/bold}{white-fg}${path.basename(this.rootDir)}{/} {/bold}`;
    const panel = `{#7aa2f7-fg}Panel: {/bold}{white-fg}${this.focusedPanel}{/} {/bold}`;
    const streaming = this.streaming ? ` {#e06c75-fg}● STREAMING{/} ` : '';
    const session = `{#565f89-fg}Session: ${this.sessionId.slice(0, 8)}{/}`;

    this.statusBar.setContent(` ${streaming}│ ${agent} │ ${model} │ ${dir} │ ${panel} │ ${session} `);
    this.screen.render();
  }

  showNotification(text) {
    const notification = blessed.box({
      parent: this.screen,
      top: 4,
      right: 2,
      width: text.length + 6,
      height: 3,
      border: { type: 'line' },
      tags: true,
      content: ` ${text} `,
      style: {
        border: { fg: '#9ece6a' },
        fg: '#9ece6a',
        bg: '#1a1b26'
      }
    });

    this.screen.render();
    setTimeout(() => {
      notification.destroy();
      this.screen.render();
    }, 2000);
  }
}

module.exports = { CodeForgeIDE };

// If run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--continue') options.continue = true;
    if (args[i] === '--session' && args[i + 1]) options.session = args[++i];
    if (args[i] === '--agent' && args[i + 1]) options.agent = args[++i];
    if (args[i] === '--model' && args[i + 1]) options.model = args[++i];
  }

  const config = loadConfig();
  if (!config.apiKey) {
    console.log(chalk.yellow('No API key configured.'));
    console.log(chalk.gray('Run: codeforge providers --set-key <your-key>'));
    process.exit(1);
  }

  const ide = new CodeForgeIDE(options);
  ide.start();
}
