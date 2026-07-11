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
  default: `You are CodeForge AI, an expert coding assistant. Help the user with their coding tasks. Write clean, production-ready code with best practices.`,
  planner: `You are an expert software architect. Create detailed project plans with:
- Project Overview
- Tech Stack Recommendations
- File Structure
- Implementation Steps
- Potential Challenges`,
  coder: `You are an expert code generator. Write clean, production-ready code with:
- Best practices
- Error handling
- Documentation
- Type hints`,
  debugger: `You are an expert debugger. Analyze code and provide:
- Issue identification
- Root cause analysis
- Prevention tips
- A FIXED version of the code inside a markdown code block starting with \`\`\`fixed\`\``,
  reviewer: `You are an expert code reviewer. Provide:
- Summary
- Strengths
- Issues (severity: high/medium/low)
- Recommendations
- Rating (1-10)`,
  explainer: `You are an expert technical educator. Explain the provided code clearly:
- High-level purpose
- Line-by-line or section-by-section breakdown
- Key concepts used
- Potential improvements for clarity`
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

function printBanner() {
  console.log(chalk.blue(`
  _____          ______      ______                __      
 / ____|        |  ____|    |  ____|               | |     
| |     ___  ___| |__  __  _| |__   _ __ ___   ___| | ___  
| |    / _ \\/ __|  _ \\ \\/ / |  __| | '_ \` _ \ / _ \ |/ _ \ 
| |___|  __/ (__| | | \  /  | |____| | | | | |  __/ | (_) |
 \_____|\___|\___|_| |_|\/   |______|_| |_| |_|\___|_|\___/ 
                                                             
  ${chalk.gray('AI-Powered Coding Assistant for the Terminal')}
  ${chalk.gray('Version: ' + VERSION)}
`));
}

function printSessionInfo(sessionId, model) {
  const meta = getSessionMeta(sessionId);
  if (meta) {
    console.log(chalk.gray(`Session: ${sessionId} | Model: ${model} | Messages: ${meta.messageCount || 0}`));
  }
}

// ═══════════════════════════════════════════════════════════
// Interactive TUI
// ═══════════════════════════════════════════════════════════

async function startTUI(options) {
  const config = loadConfig();

  if (!config.apiKey) {
    printBanner();
    console.log(chalk.yellow('⚠ No API key configured.'));
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
        console.log(chalk.green(`Continuing session: ${sessionId}`));
      } else {
        sessionId = generateId();
        console.log(chalk.yellow('No previous session found. Starting new session.'));
      }
    } else {
      messages = loadSession(sessionId);
      console.log(chalk.green(`Loaded session: ${sessionId}`));
    }
  } else {
    sessionId = generateId();
  }

  const model = options.model || config.defaultModel;
  const agent = options.agent || 'default';

  printSessionInfo(sessionId, model);
  console.log(chalk.gray('Type your message, /help for commands, Ctrl+C to exit\n'));

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

    // Build system prompt
    const systemPrompt = SYSTEM_PROMPTS[currentAgent] || SYSTEM_PROMPTS.default;
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-config.maxHistory)
    ];

    // Determine model
    let useModel = model;
    if (config.autoMode && AGENT_MODELS[currentAgent]) {
      useModel = AGENT_MODELS[currentAgent] || model;
    }

    const spinner = ora({ text: 'Thinking...', color: 'cyan' }).start();

    try {
      const response = await chat(apiMessages, useModel, config.apiKey, (chunk) => {
        spinner.stop();
        process.stdout.write(chalk.green(chunk));
      });

      spinner.stop();

      if (typeof response === 'object') {
        // Non-streaming response
        console.log(chalk.green('\n\nCodeForge: ') + formatOutput(response.content));
        messages.push({ role: 'assistant', content: response.content });

        // Update stats
        const stats = loadStats();
        stats.totalTokens += response.tokens || 0;
        stats.requests++;
        stats.byModel[response.model] = (stats.byModel[response.model] || 0) + 1;
        saveStats(stats);
      } else {
        // Streaming response
        console.log('');
        messages.push({ role: 'assistant', content: response });
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
      console.log('  /quit              Exit\n');
      break;

    case '/clear':
      messages.length = 0;
      saveSession(sessionId, []);
      console.log(chalk.green('Session cleared.'));
      break;

    case '/export':
      const exportData = { sessionId, model, agent, messages, exportedAt: new Date().toISOString() };
      const exportFile = path.join(CONFIG_DIR, `export-${sessionId}.json`);
      fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2));
      console.log(chalk.green(`Session exported to: ${exportFile}`));
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
      console.log(chalk.yellow('⚠ No API key configured. Run: codeforge providers --set-key <key>'));
      return;
    }

    const message = messageParts.join(' ');
    const agent = options.agent || 'default';
    const model = options.model || (config.autoMode && AGENT_MODELS[agent] ? AGENT_MODELS[agent] : config.defaultModel);

    const systemPrompt = SYSTEM_PROMPTS[agent] || SYSTEM_PROMPTS.default;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    const spinner = ora('Thinking...').start();
    try {
      const response = await chat(messages, model, config.apiKey);
      spinner.stop();
      console.log(formatOutput(response.content));

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
