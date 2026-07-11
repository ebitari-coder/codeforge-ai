#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const VERSION = '1.0.0';
const CONFIG_DIR = path.join(require('os').homedir(), '.codeforge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SESSIONS_DIR = path.join(CONFIG_DIR, 'sessions');
const STATS_FILE = path.join(CONFIG_DIR, 'stats.json');

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

You have access to the user's workspace. When they ask about "this project" or "the codebase", analyze the workspace context provided below.

IMPORTANT: When the user asks to understand the project, read the workspace context and provide a comprehensive overview. Don't ask for links or descriptions - you already have access to the project.

When you need to read a file, respond with: [READ: filepath]
When you need to list a directory, respond with: [LIST: dirpath]
When you need to search for files, respond with: [SEARCH: pattern]

Always provide clean, production-ready code with best practices.`,
  planner: `You are an expert software architect. Analyze the workspace and create detailed project plans with:
- Project Overview (based on actual code)
- Tech Stack (detected from dependencies)
- Current File Structure
- Implementation Steps
- Potential Challenges

When you need to read a file, respond with: [READ: filepath]
When you need to list a directory, respond with: [LIST: dirpath]`,
  coder: `You are an expert code generator. Write clean, production-ready code with:
- Best practices for the detected language/framework
- Error handling
- Documentation
- Type hints

When you need to read existing code for context, respond with: [READ: filepath]`,
  debugger: `You are an expert debugger. Analyze code and provide:
- Issue identification
- Root cause analysis  
- Prevention tips
- A FIXED version of the code inside a markdown code block starting with \`\`\`fixed\`\`

When you need to read files to debug, respond with: [READ: filepath]`,
  reviewer: `You are an expert code reviewer. Analyze the workspace and provide:
- Summary of the codebase
- Strengths
- Issues (severity: high/medium/low)
- Recommendations
- Rating (1-10)

When you need to read files for review, respond with: [READ: filepath]`,
  explainer: `You are an expert technical educator. Explain code clearly:
- High-level purpose
- Line-by-line or section-by-line breakdown
- Key concepts used
- Potential improvements

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

function loadStats() {
  ensureDirs();
  if (fs.existsSync(STATS_FILE)) {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  }
  return { totalTokens: 0, totalCost: 0, requests: 0, sessions: 0, byModel: {} };
}

function saveStats(stats) {
  ensureDirs();
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
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

function listSessions() {
  ensureDirs();
  return fs.readdirSync(SESSIONS_DIR).filter(d => {
    const meta = getSessionMeta(d);
    return meta !== null;
  }).map(d => ({
    id: d,
    ...getSessionMeta(d)
  })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function getLastSession() {
  const sessions = listSessions();
  return sessions.length > 0 ? sessions[0] : null;
}

// ═══════════════════════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════════════════════

function chat(messages, model, apiKey, onStream) {
  return new Promise((resolve, reject) => {
    const config = loadConfig();
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

async function fetchModels(apiKey) {
  const config = loadConfig();
  return new Promise((resolve, reject) => {
    https.get('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey || config.apiKey}` }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response.data || []);
        } catch (e) {
          reject(new Error('Failed to parse models'));
        }
      });
    }).on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════
// Display Functions
// ═══════════════════════════════════════════════════════════

function formatOutput(text) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return chalk.cyan(`\n[${lang || 'code'}]`) + '\n' + chalk.white(code.trim());
    })
    .replace(/\*\*(.*?)\*\*/g, (_, text) => chalk.bold(text))
    .replace(/\*(.*?)\*/g, (_, text) => chalk.italic(text));
}

async function handleAIFileOps(text) {
  const readPattern = /\[READ:\s*(.+?)\]/g;
  const listPattern = /\[LIST:\s*(.+?)\]/g;
  const searchPattern = /\[SEARCH:\s*(.+?)\]/g;

  let result = text;
  let match;

  // Handle [READ: filepath]
  while ((match = readPattern.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = workspace.readFile(filePath);
    if (content) {
      const lang = path.extname(filePath).slice(1) || 'text';
      result = result.replace(match[0], `\n\`\`\`${lang}\n${content}\n\`\`\`\n`);
    } else {
      result = result.replace(match[0], `\n[Could not read file: ${filePath}]\n`);
    }
  }

  // Handle [LIST: dirpath]
  while ((match = listPattern.exec(text)) !== null) {
    const dirPath = match[1].trim();
    const items = workspace.listDir(dirPath);
    if (items) {
      const listing = items.map(i => i.isDir ? `  📁 ${i.name}/` : `  📄 ${i.name}`).join('\n');
      result = result.replace(match[0], `\n${listing}\n`);
    } else {
      result = result.replace(match[0], `\n[Could not list directory: ${dirPath}]\n`);
    }
  }

  // Handle [SEARCH: pattern]
  while ((match = searchPattern.exec(text)) !== null) {
    const pattern = match[1].trim();
    const files = workspace.searchFiles(pattern);
    if (files.length > 0) {
      const listing = files.map(f => `  📄 ${f}`).join('\n');
      result = result.replace(match[0], `\nFound files:\n${listing}\n`);
    } else {
      result = result.replace(match[0], `\n[No files matching: ${pattern}]\n`);
    }
  }

  return result;
}

function printBanner() {
  console.log(`
${chalk.gray('⠀')}
${chalk.cyan('█▀▄▀█ █ █▄ ▄█ █▀▀█ █▀▀ █▀▀█ █▀▀▄ █▀▀▀')}
${chalk.cyan('█ ▀ █ █ █ ▀ █ █  █ █   █  █ █  █ █▀▀ ')}
${chalk.cyan('▀   ▀ ▀ ▀   ▀ ▀▀▀▀ ▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀▀')}
${chalk.gray('⠀')}
`);
}

function printStatusLine(model, agent, workspaceDir) {
  const dir = path.basename(workspaceDir);
  console.log(chalk.gray(`model: ${chalk.white(model)} │ agent: ${chalk.white(agent)} │ dir: ${chalk.white(dir)}`));
  console.log(chalk.gray('─'.repeat(60)));
}

// ═══════════════════════════════════════════════════════════
// Workspace Manager
// ═══════════════════════════════════════════════════════════

class WorkspaceManager {
  constructor() {
    this.rootDir = process.cwd();
    this.projectInfo = null;
  }

  getRootDir() {
    return this.rootDir;
  }

  setRootDir(dir) {
    this.rootDir = dir;
    this.projectInfo = null;
  }

  detectProject() {
    if (this.projectInfo) return this.projectInfo;

    const info = {
      name: path.basename(this.rootDir),
      type: 'unknown',
      files: [],
      structure: '',
      config: null
    };

    // Detect project type
    const checks = [
      { file: 'package.json', type: 'node' },
      { file: 'Cargo.toml', type: 'rust' },
      { file: 'go.mod', type: 'go' },
      { file: 'requirements.txt', type: 'python' },
      { file: 'pyproject.toml', type: 'python' },
      { file: 'Gemfile', type: 'ruby' },
      { file: 'pom.xml', type: 'java' },
      { file: 'build.gradle', type: 'java' },
      { file: 'Makefile', type: 'c/c++' },
      { file: 'CMakeLists.txt', type: 'c/c++' },
      { file: 'tsconfig.json', type: 'typescript' },
      { file: '.git', type: 'git' },
    ];

    for (const check of checks) {
      if (fs.existsSync(path.join(this.rootDir, check.file))) {
        if (check.type !== 'git') info.type = check.type;
      }
    }

    // Read package.json if exists
    const pkgPath = path.join(this.rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        info.config = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        info.name = info.config.name || info.name;
      } catch (e) {}
    }

    // Build file tree
    info.structure = this.getTree(this.rootDir, 0, 2);

    this.projectInfo = info;
    return info;
  }

  getTree(dir, depth = 0, maxDepth = 2) {
    if (depth >= maxDepth) return '';
    
    let tree = '';
    try {
      const items = fs.readdirSync(dir)
        .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== '__pycache__' && f !== 'target' && f !== 'dist' && f !== '.git')
        .sort((a, b) => {
          const aIsDir = fs.statSync(path.join(dir, a)).isDirectory();
          const bIsDir = fs.statSync(path.join(dir, b)).isDirectory();
          return aIsDir === bIsDir ? a.localeCompare(b) : aIsDir ? -1 : 1;
        })
        .slice(0, 30);

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        const indent = '  '.repeat(depth);
        
        if (isDir) {
          tree += `${indent}${item}/\n`;
          tree += this.getTree(itemPath, depth + 1, maxDepth);
        } else {
          tree += `${indent}${item}\n`;
        }
      }
    } catch (e) {}
    return tree;
  }

  readFile(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.rootDir, filePath);
    if (!fs.existsSync(fullPath)) return null;
    if (fs.statSync(fullPath).isDirectory()) return null;
    
    // Check file size (limit to 100KB)
    const stat = fs.statSync(fullPath);
    if (stat.size > 100 * 1024) return `[File too large: ${(stat.size / 1024).toFixed(1)}KB]`;
    
    return fs.readFileSync(fullPath, 'utf8');
  }

  listDir(dirPath) {
    const fullPath = dirPath ? (path.isAbsolute(dirPath) ? dirPath : path.join(this.rootDir, dirPath)) : this.rootDir;
    if (!fs.existsSync(fullPath)) return null;
    
    try {
      return fs.readdirSync(fullPath)
        .filter(f => !f.startsWith('.'))
        .map(f => {
          const fPath = path.join(fullPath, f);
          const isDir = fs.statSync(fPath).isDirectory();
          return { name: f, isDir };
        })
        .sort((a, b) => a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1);
    } catch (e) {
      return null;
    }
  }

  searchFiles(pattern, dir) {
    const searchDir = dir ? (path.isAbsolute(dir) ? dir : path.join(this.rootDir, dir)) : this.rootDir;
    const results = [];
    const regex = new RegExp(pattern, 'i');
    
    const walk = (currentDir, depth = 0) => {
      if (depth > 5) return;
      try {
        const items = fs.readdirSync(currentDir)
          .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== '__pycache__' && f !== '.git');
        
        for (const item of items) {
          const itemPath = path.join(currentDir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            walk(itemPath, depth + 1);
          } else if (regex.test(item) || regex.test(fs.readFileSync(itemPath, 'utf8').slice(0, 10000))) {
            results.push(path.relative(this.rootDir, itemPath));
          }
        }
      } catch (e) {}
    };
    
    walk(searchDir);
    return results.slice(0, 20);
  }

  getWorkspaceContext() {
    const project = this.detectProject();
    let context = `Current workspace: ${this.rootDir}\n`;
    context += `Project: ${project.name} (${project.type})\n`;
    context += `\nProject structure:\n${project.structure}`;
    
    if (project.config?.description) {
      context += `\nDescription: ${project.config.description}`;
    }
    if (project.config?.scripts) {
      context += `\nScripts: ${Object.keys(project.config.scripts).join(', ')}`;
    }
    if (project.config?.dependencies) {
      context += `\nDependencies: ${Object.keys(project.config.dependencies).slice(0, 15).join(', ')}`;
    }
    
    return context;
  }
}

const workspace = new WorkspaceManager();

// ═══════════════════════════════════════════════════════════
// Interactive TUI
// ═══════════════════════════════════════════════════════════

async function startTUI(options) {
  const config = loadConfig();

  if (!config.apiKey) {
    printBanner();
    console.log(chalk.yellow('No API key configured.'));
    console.log(chalk.gray('Run: codeforge providers --set-key <your-key>\n'));
    return;
  }

  printBanner();

  let sessionId = options.session;
  let messages = [];

  if (options.continue || options.session) {
    if (options.continue) {
      const last = getLastSession();
      if (last) {
        sessionId = last.id;
        messages = loadSession(sessionId);
      } else {
        sessionId = generateId();
      }
    } else {
      messages = loadSession(sessionId);
    }
  } else {
    sessionId = generateId();
  }

  const model = options.model || config.defaultModel;
  const agent = options.agent || 'default';

  printStatusLine(model, agent, workspace.getRootDir());

  const sessionDir = getSessionDir(sessionId);
  saveSessionMeta(sessionId, {
    id: sessionId,
    model,
    agent,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: messages.length
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('❯ ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      await handleCommand(input, sessionId, messages, model, agent, config);
      rl.prompt();
      return;
    }

    // Handle @agent switching
    let currentAgent = agent;
    let userMessage = input;
    const agentMatch = input.match(/^@(\w+)\s+(.*)/);
    if (agentMatch) {
      currentAgent = agentMatch[1];
      userMessage = agentMatch[2];
      console.log(chalk.gray(`Switched to agent: ${currentAgent}`));
    }

    // Add user message
    messages.push({ role: 'user', content: userMessage });

    // Build system prompt with workspace context
    const basePrompt = SYSTEM_PROMPTS[currentAgent] || SYSTEM_PROMPTS.default;
    const workspaceContext = workspace.getWorkspaceContext();
    const systemPrompt = `${basePrompt}\n\n${workspaceContext}`;
    
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-config.maxHistory)
    ];

    // Determine model
    let useModel = model;
    if (config.autoMode && AGENT_MODELS[currentAgent]) {
      useModel = AGENT_MODELS[currentAgent] || model;
    }

    const spinner = ora({ text: 'Thinking...', color: 'gray' }).start();

    try {
      const response = await chat(apiMessages, useModel, config.apiKey, (chunk) => {
        spinner.stop();
        process.stdout.write(chalk.green(chunk));
      });

      spinner.stop();

      let responseText = typeof response === 'object' ? response.content : response;

      // Handle file operations from AI
      responseText = await handleAIFileOps(responseText);

      console.log('');
      console.log(formatOutput(responseText));
      console.log('');
      messages.push({ role: 'assistant', content: responseText });

      // Update stats
      if (typeof response === 'object') {
        const stats = loadStats();
        stats.totalTokens += response.tokens || 0;
        stats.requests++;
        stats.byModel[response.model] = (stats.byModel[response.model] || 0) + 1;
        saveStats(stats);
      }

      // Save session
      saveSession(sessionId, messages);
      saveSessionMeta(sessionId, {
        id: sessionId,
        model: useModel,
        agent: currentAgent,
        createdAt: getSessionMeta(sessionId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: messages.length
      });

    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`\nError: ${error.message}\n`));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.gray('\nSession saved. Run `codeforge --continue` to resume.'));
    process.exit(0);
  });
}

async function handleCommand(input, sessionId, messages, model, agent, config) {
  const parts = input.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      console.log(chalk.blue('\nCommands:'));
      console.log('  /help              Show this help');
      console.log('  /clear             Clear current session');
      console.log('  /export            Export session as JSON');
      console.log('  /sessions          List all sessions');
      console.log('  /switch <id>       Switch to another session');
      console.log('  /model <model>     Switch model');
      console.log('  /agent <agent>     Switch agent (planner/coder/debugger/reviewer/explainer)');
      console.log('  /auto              Toggle auto mode');
      console.log('  /stats             Show usage statistics');
      console.log('  /cd <dir>          Change workspace directory');
      console.log('  /pwd               Show current workspace');
      console.log('  /tree              Show project file tree');
      console.log('  /read <file>       Read a file');
      console.log('  /ls [dir]          List directory contents');
      console.log('  /find <pattern>    Search for files');
      console.log('  /quit              Exit\n');
      break;

    case '/clear':
      messages.length = 0;
      saveSession(sessionId, []);
      console.log(chalk.gray('Session cleared.'));
      break;

    case '/export':
      const exportData = { sessionId, model, agent, messages, exportedAt: new Date().toISOString() };
      const exportFile = path.join(CONFIG_DIR, `export-${sessionId}.json`);
      fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2));
      console.log(chalk.gray(`Exported to ${exportFile}`));
      break;

    case '/sessions':
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log(chalk.gray('No sessions found.'));
      } else {
        console.log(chalk.blue('\nSessions:'));
        sessions.forEach(s => {
          const marker = s.id === sessionId ? chalk.green(' → ') : '   ';
          console.log(`${marker}${s.id} | ${s.model} | ${s.messageCount || 0} msgs | ${new Date(s.updatedAt).toLocaleDateString()}`);
        });
      }
      break;

    case '/switch':
      if (parts[1]) {
        sessionId = parts[1];
        messages.length = 0;
        messages.push(...loadSession(sessionId));
        console.log(chalk.green(`Switched to session: ${sessionId}`));
        printSessionInfo(sessionId, model);
      } else {
        console.log(chalk.yellow('Usage: /switch <session-id>'));
      }
      break;

    case '/model':
      if (parts[1]) {
        config.defaultModel = parts[1];
        saveConfig(config);
        console.log(chalk.green(`Model changed to: ${parts[1]}`));
      } else {
        console.log(chalk.gray(`Current model: ${config.defaultModel}`));
      }
      break;

    case '/agent':
      if (parts[1]) {
        const newAgent = parts[1];
        if (SYSTEM_PROMPTS[newAgent]) {
          console.log(chalk.green(`Agent changed to: ${newAgent}`));
        } else {
          console.log(chalk.yellow(`Unknown agent: ${newAgent}. Available: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`));
        }
      } else {
        console.log(chalk.gray(`Current agent: ${agent}`));
        console.log(chalk.gray(`Available: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`));
      }
      break;

    case '/auto':
      config.autoMode = !config.autoMode;
      saveConfig(config);
      console.log(chalk.green(`Auto mode: ${config.autoMode ? 'ON' : 'OFF'}`));
      break;

    case '/stats':
      const stats = loadStats();
      console.log(chalk.blue('\nStatistics:'));
      console.log(`  Total requests: ${stats.requests}`);
      console.log(`  Total tokens: ${stats.totalTokens.toLocaleString()}`);
      console.log(`  Sessions: ${Object.keys(fs.readdirSync(SESSIONS_DIR)).length}`);
      if (Object.keys(stats.byModel).length > 0) {
        console.log(chalk.gray('\nBy model:'));
        Object.entries(stats.byModel).forEach(([model, count]) => {
          console.log(`  ${model}: ${count} requests`);
        });
      }
      break;

    case '/cd':
      if (parts[1]) {
        const targetDir = path.isAbsolute(parts[1]) ? parts[1] : path.join(workspace.getRootDir(), parts[1]);
        if (fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
          workspace.setRootDir(targetDir);
          workspace.projectInfo = null;
          printStatusLine(model, agent, workspace.getRootDir());
        } else {
          console.log(chalk.gray(`Not found: ${parts[1]}`));
        }
      } else {
        printStatusLine(model, agent, workspace.getRootDir());
      }
      break;

    case '/pwd':
      console.log(chalk.gray(workspace.getRootDir()));
      break;

    case '/tree':
      const tree = workspace.getTree(workspace.getRootDir(), 0, 3);
      console.log(chalk.blue('\nProject Structure:'));
      console.log(tree);
      break;

    case '/read':
      if (parts[1]) {
        const content = workspace.readFile(parts.slice(1).join(' '));
        if (content) {
          console.log(chalk.blue('\nFile Content:'));
          console.log(content);
        } else {
          console.log(chalk.red(`Could not read file: ${parts[1]}`));
        }
      } else {
        console.log(chalk.yellow('Usage: /read <filepath>'));
      }
      break;

    case '/ls':
      const dirPath = parts[1] || '';
      const items = workspace.listDir(dirPath);
      if (items) {
        console.log(chalk.blue(`\nDirectory: ${dirPath || '.'}`));
        items.forEach(item => {
          console.log(item.isDir ? chalk.blue(`  📁 ${item.name}/`) : `  📄 ${item.name}`);
        });
      } else {
        console.log(chalk.red(`Could not list directory: ${dirPath}`));
      }
      break;

    case '/find':
      if (parts[1]) {
        const files = workspace.searchFiles(parts.slice(1).join(' '));
        if (files.length > 0) {
          console.log(chalk.blue(`\nFound ${files.length} files:`));
          files.forEach(f => console.log(`  📄 ${f}`));
        } else {
          console.log(chalk.gray('No files found.'));
        }
      } else {
        console.log(chalk.yellow('Usage: /find <pattern>'));
      }
      break;

    case '/quit':
    case '/exit':
      console.log(chalk.gray('Goodbye!'));
      process.exit(0);

    default:
      console.log(chalk.yellow(`Unknown command: ${cmd}. Type /help for available commands.`));
  }
}

// ═══════════════════════════════════════════════════════════
// CLI Commands
// ═══════════════════════════════════════════════════════════

program
  .name('codeforge')
  .description('CodeForge AI - AI-powered coding assistant for the terminal')
  .version(VERSION);

program
  .command('providers')
  .description('Manage AI providers and credentials')
  .option('--set-key <key>', 'Set OpenRouter API key')
  .option('--set-model <model>', 'Set default model')
  .option('--show', 'Show current configuration')
  .action((options) => {
    const config = loadConfig();
    if (options.setKey) {
      config.apiKey = options.setKey;
      saveConfig(config);
      console.log(chalk.green('✓ API key saved'));
    }
    if (options.setModel) {
      config.defaultModel = options.setModel;
      saveConfig(config);
      console.log(chalk.green(`✓ Default model: ${options.setModel}`));
    }
    if (options.show || (!options.setKey && !options.setModel)) {
      console.log(chalk.blue('\nConfiguration:'));
      console.log(`  Provider: ${config.provider}`);
      console.log(`  API Key: ${config.apiKey ? '***' + config.apiKey.slice(-4) : 'Not set'}`);
      console.log(`  Default Model: ${config.defaultModel}`);
      console.log(`  Auto Mode: ${config.autoMode ? 'ON' : 'OFF'}`);
      console.log(`  Temperature: ${config.temperature}`);
      console.log(`  Max Tokens: ${config.maxTokens}`);
    }
  });

program
  .command('models')
  .description('List available free models')
  .action(async () => {
    const config = loadConfig();
    if (!config.apiKey) {
      console.log(chalk.yellow('⚠ No API key configured. Run: codeforge providers --set-key <key>'));
      return;
    }

    const spinner = ora('Fetching models...').start();
    try {
      const models = await fetchModels(config.apiKey);
      const freeModels = models.filter(m =>
        m.pricing?.prompt === '0' && m.pricing?.completion === '0'
      );

      spinner.stop();
      console.log(chalk.blue(`\n📦 Available Free Models (${freeModels.length}):\n`));
      freeModels.forEach(m => {
        console.log(`  ${chalk.cyan(m.id)} - ${m.name || 'Unknown'} (${m.context_length || '?'} tokens)`);
      });
    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('sessions')
  .description('Manage sessions')
  .option('-l, --list', 'List all sessions')
  .option('-d, --delete <id>', 'Delete a session')
  .option('--clear', 'Delete all sessions')
  .action((options) => {
    ensureDirs();
    if (options.clear) {
      const sessions = fs.readdirSync(SESSIONS_DIR);
      sessions.forEach(s => fs.rmSync(path.join(SESSIONS_DIR, s), { recursive: true }));
      console.log(chalk.green('All sessions deleted.'));
      return;
    }
    if (options.delete) {
      const dir = path.join(SESSIONS_DIR, options.delete);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
        console.log(chalk.green(`Session ${options.delete} deleted.`));
      } else {
        console.log(chalk.yellow(`Session ${options.delete} not found.`));
      }
      return;
    }

    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions found.'));
    } else {
      console.log(chalk.blue('\nSessions:'));
      sessions.forEach(s => {
        console.log(`  ${s.id} | ${s.model} | ${s.messageCount || 0} msgs | ${new Date(s.updatedAt).toLocaleDateString()}`);
      });
    }
  });

program
  .command('stats')
  .description('Show usage statistics')
  .action(() => {
    const stats = loadStats();
    const sessions = listSessions();
    console.log(chalk.blue('\n📊 Statistics:'));
    console.log(`  Total requests: ${stats.requests}`);
    console.log(`  Total tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`  Sessions: ${sessions.length}`);
    if (Object.keys(stats.byModel).length > 0) {
      console.log(chalk.gray('\nBy model:'));
      Object.entries(stats.byModel).forEach(([model, count]) => {
        console.log(`    ${model}: ${count} requests`);
      });
    }
  });

program
  .command('export [sessionId]')
  .description('Export session data as JSON')
  .action((sessionId) => {
    if (sessionId) {
      const file = path.join(SESSIONS_DIR, sessionId, 'messages.json');
      if (fs.existsSync(file)) {
        console.log(fs.readFileSync(file, 'utf8'));
      } else {
        console.log(chalk.yellow(`Session ${sessionId} not found.`));
      }
    } else {
      const last = getLastSession();
      if (last) {
        const file = path.join(SESSIONS_DIR, last.id, 'messages.json');
        console.log(fs.readFileSync(file, 'utf8'));
      } else {
        console.log(chalk.gray('No sessions to export.'));
      }
    }
  });

program
  .command('run <message..>')
  .description('Run a single message (non-interactive)')
  .option('-m, --model <model>', 'Model to use')
  .option('-a, --agent <agent>', 'Agent to use')
  .action(async (messageParts, options) => {
    const config = loadConfig();
    if (!config.apiKey) {
      console.log(chalk.yellow('No API key configured. Run: codeforge providers --set-key <key>'));
      return;
    }

    const message = Array.isArray(messageParts) ? messageParts.join(' ') : messageParts;
    const agent = options.agent || 'default';
    const model = options.model || (config.autoMode && AGENT_MODELS[agent] ? AGENT_MODELS[agent] : config.defaultModel);

    const basePrompt = SYSTEM_PROMPTS[agent] || SYSTEM_PROMPTS.default;
    const workspaceContext = workspace.getWorkspaceContext();
    const systemPrompt = `${basePrompt}\n\n${workspaceContext}`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    const spinner = ora('Thinking...').start();
    try {
      const response = await chat(messages, model, config.apiKey);
      spinner.stop();
      let responseText = response.content;
      responseText = await handleAIFileOps(responseText);
      console.log(formatOutput(responseText));

      const stats = loadStats();
      stats.totalTokens += response.tokens || 0;
      stats.requests++;
      stats.byModel[response.model] = (stats.byModel[response.model] || 0) + 1;
      saveStats(stats);
    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('review')
  .description('Review code')
  .option('-f, --file <file>', 'File to review')
  .option('-c, --code <code>', 'Code string to review')
  .option('-m, --model <model>', 'Model to use')
  .action(async (options) => {
    const config = loadConfig();
    if (!config.apiKey) {
      console.log(chalk.yellow('⚠ No API key configured.'));
      return;
    }

    let code = options.code;
    if (options.file) code = fs.readFileSync(options.file, 'utf8');
    if (!code) { console.log(chalk.yellow('⚠ Provide code via --file or --code')); return; }

    const model = options.model || (config.autoMode ? AGENT_MODELS.reviewer : config.defaultModel);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.reviewer },
      { role: 'user', content: `Review this code:\n\`\`\`\n${code}\n\`\`\`` }
    ];

    const spinner = ora('Reviewing...').start();
    try {
      const response = await chat(messages, model, config.apiKey);
      spinner.stop();
      console.log(formatOutput(response.content));
    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('debug')
  .description('Analyze and debug code')
  .option('-f, --file <file>', 'File to debug')
  .option('-c, --code <code>', 'Code string to debug')
  .option('-m, --model <model>', 'Model to use')
  .action(async (options) => {
    const config = loadConfig();
    if (!config.apiKey) {
      console.log(chalk.yellow('⚠ No API key configured.'));
      return;
    }

    let code = options.code;
    if (options.file) code = fs.readFileSync(options.file, 'utf8');
    if (!code) { console.log(chalk.yellow('⚠ Provide code via --file or --code')); return; }

    const model = options.model || (config.autoMode ? AGENT_MODELS.debugger : config.defaultModel);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.debugger },
      { role: 'user', content: `Analyze this code:\n\`\`\`\n${code}\n\`\`\`` }
    ];

    const spinner = ora('Analyzing...').start();
    try {
      const response = await chat(messages, model, config.apiKey);
      spinner.stop();
      console.log(formatOutput(response.content));
    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .command('explain')
  .description('Explain code')
  .option('-f, --file <file>', 'File to explain')
  .option('-c, --code <code>', 'Code string to explain')
  .option('-m, --model <model>', 'Model to use')
  .action(async (options) => {
    const config = loadConfig();
    if (!config.apiKey) {
      console.log(chalk.yellow('⚠ No API key configured.'));
      return;
    }

    let code = options.code;
    if (options.file) code = fs.readFileSync(options.file, 'utf8');
    if (!code) { console.log(chalk.yellow('⚠ Provide code via --file or --code')); return; }

    const model = options.model || (config.autoMode ? AGENT_MODELS.explainer : config.defaultModel);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPTS.explainer },
      { role: 'user', content: `Explain this code:\n\`\`\`\n${code}\n\`\`\`` }
    ];

    const spinner = ora('Explaining...').start();
    try {
      const response = await chat(messages, model, config.apiKey);
      spinner.stop();
      console.log(formatOutput(response.content));
    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`Error: ${error.message}`));
    }
  });

program
  .action(async (options) => {
    await startTUI(options);
  });

program.parse();
