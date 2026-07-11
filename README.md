# CodeForge AI 🤖

**CodeForge AI** is an advanced, purpose-built VS Code extension designed to bring high-performance AI agents directly into your development workflow—**without requiring your own API keys**.

## 🚀 Key Features

- **Managed AI Access**: No complex setup. The extension provides managed access to powerful free models via OpenRouter.
- **Silent High Availability**: Automatically and silently falls back to alternative models if the primary one is busy or down.
- **Dynamic Model Discovery**: Always stay updated with the latest free models fetched directly from the OpenRouter API.
- **Specialized AI Agents**:
  - 📋 **Planner**: Generate project structures and implementation roadmaps.
  - 💻 **Coder**: Write clean, production-ready code with best practices.
  - 🔧 **Debugger**: Analyze issues and **automatically apply fixes** to your files.
  - 👀 **Reviewer**: Get professional code quality audits and ratings.
  - 💡 **Explainer**: Line-by-line technical education for complex logic.
- **Smart Context Awareness**: Automatically analyzes the full file or your current workspace if no text is selected.
- **Auto Mode**: Intelligently selects the best model for the specific task at hand.
- **Persistent Context**: Chat history is saved locally in `.codeforge/`, preserving your project's context even across IDE reinstalls.
- **Inline Code Lenses**: Quick actions ("Explain", "Review") appear directly above your functions and classes.

## 🛠️ Getting Started

### VS Code Extension

1.  **Install**: Open the `codeforge-ai-1.0.0.vsix` file in VS Code or install via the Extensions menu.
2.  **Open Sidebar**: Click the 🤖 icon in the Activity Bar to open the CodeForge AI panel.
3.  **Start Chatting**: Use the **Chat** tab for general questions or the **Agents** tab for specialized tasks.
4.  **Auto Mode**: Toggle **🚀 Auto Mode** to let the extension choose the best model for your task automatically.

### CLI Tool

**Quick Install (Linux/macOS):**
```bash
curl -fsSL https://codeforge.ai/install.sh | bash
```

**Quick Install (Windows PowerShell):**
```powershell
irm https://codeforge.ai/install.ps1 | iex
```

**npm:**
```bash
npm install -g codeforge-cli
```

**From Source:**
```bash
cd cli
npm install
npm link
```

**Usage:**
```bash
# Configure API key
codeforge providers --set-key sk-or-v1-your-key-here

# Start interactive TUI
codeforge

# Continue last session
codeforge --continue

# Run single message
codeforge run "explain this code: const x = 1"

# Use specific agent
codeforge run --agent coder "write a sort function"
```

## 🧠 Operating Principles

All agents follow the strict guidelines defined in `AGENTS.md`, prioritizing:
- **Correctness**: Working code is the first priority.
- **Simplicity**: Avoid overengineering and unnecessary complexity.
- **Maintainability**: Clean, modular, and well-documented output.
- **Security**: Best practices for protecting secrets and validating inputs.

## ⚙️ Development

```bash
# Install dependencies
npm install

# Compile the extension
npm run esbuild

# Package the extension
npm run package
```

## 🏗️ Building the CodeForge AI IDE

To build the custom **CodeForge AI IDE**, follow these steps to integrate the extension into the VSCodium fork:

### Linux/macOS

```bash
# Run from the extension directory
./release/deploy-ide.sh

# Build the IDE
cd ../codeforge-ai-ide
export APP_NAME='CodeForge AI'
export BINARY_NAME='codeforge-ai'
export RELEASE_VERSION='1.0.0'
./prepare_vscode.sh
cd vscode && npm run gulp vscode-linux-x64-min-pack
```

### Windows (PowerShell)

```powershell
# Run from the extension directory
.\release\deploy-ide.ps1

# Build the IDE
cd C:\path\to\codeforge-ai-ide
yarn install --frozen-lockfile
yarn gulp vscode-win32-x64
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
