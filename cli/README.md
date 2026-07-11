# CodeForge AI CLI

A powerful command-line interface for CodeForge AI, bringing AI-powered coding assistance to your terminal. Interactive TUI, session management, and more.

## Installation

```bash
cd cli
npm install
npm link
```

## Quick Start

```bash
# Configure your API key
codeforge providers --set-key sk-or-v1-your-key-here

# Start interactive TUI
codeforge

# Continue last session
codeforge --continue

# Run a single message
codeforge run "explain this code: const x = 1"

# Use a specific agent
codeforge --agent coder
codeforge run --agent reviewer "review my code"
```

## Interactive TUI Commands

Once in the TUI, use these commands:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear current session |
| `/export` | Export session as JSON |
| `/sessions` | List all sessions |
| `/switch <id>` | Switch to another session |
| `/model <model>` | Switch model |
| `/agent <agent>` | Switch agent |
| `/auto` | Toggle auto mode |
| `/stats` | Show usage statistics |
| `/quit` | Exit |

### Agent Switching

Switch agents mid-conversation with `@agent`:

```
@coder Write a function to sort an array
@reviewer Review this code: ...
@debugger Fix this bug: ...
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `codeforge` | Start interactive TUI |
| `codeforge providers` | Manage API keys and config |
| `codeforge models` | List available free models |
| `codeforge sessions` | Manage sessions |
| `codeforge stats` | Show usage statistics |
| `codeforge export` | Export session data |
| `codeforge run <msg>` | Run single message |
| `codeforge review` | Review code |
| `codeforge debug` | Debug code |
| `codeforge explain` | Explain code |

## Auto Mode

When auto mode is enabled, the CLI automatically selects the best model for each task:

| Agent | Model |
|-------|-------|
| planner | Llama 3.3 70B |
| coder | Qwen3 Coder 30B |
| debugger | DeepSeek R1 |
| reviewer | GPT-OSS 120B |
| explainer | Gemma 4 31B |

## Session Management

Sessions are automatically saved to `~/.codeforge/sessions/`. Continue where you left off:

```bash
# Continue last session
codeforge --continue

# Continue specific session
codeforge --session <session-id>

# List all sessions
codeforge sessions --list

# Delete a session
codeforge sessions --delete <session-id>
```

## Configuration

Configuration is stored at `~/.codeforge/config.json`:

```json
{
  "provider": "openrouter",
  "apiKey": "sk-or-v1-...",
  "defaultModel": "openai/gpt-oss-120b",
  "autoMode": true,
  "maxTokens": 4096,
  "temperature": 0.7,
  "maxHistory": 50
}
```

## Piping Support

You can pipe code directly to review/debug/explain commands:

```bash
cat myfile.ts | codeforge review --code "$(cat)"
codeforge review -f myfile.ts
```

## License

MIT
