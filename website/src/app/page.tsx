'use client'

import { useState, useEffect } from 'react'

const GITHUB_REPO = 'codeforge-ai/codeforge-ai'
const RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`

type ProductKey = 'ide' | 'cli' | 'vscode'
type PlatformKey = string

export default function Home() {
  const [siteUrl, setSiteUrl] = useState('')
  const [activeProduct, setActiveProduct] = useState<ProductKey>('ide')
  const [activePlatform, setActivePlatform] = useState<PlatformKey>('linux')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setSiteUrl(window.location.origin)
  }, [])

  const getProducts = () => ({
    ide: {
      name: 'CodeForge IDE',
      tagline: 'Full-featured AI-powered IDE. Built on VSCodium with 5 specialized AI agents.',
      icon: '💻',
      downloads: {
        linux: {
          label: 'Linux',
          icon: '🐧',
          formats: [
            { name: '.deb', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-linux-amd64.deb`, size: '~120 MB' },
            { name: '.rpm', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-linux-x86_64.rpm`, size: '~120 MB' },
            { name: '.tar.gz', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-linux-x64.tar.gz`, size: '~110 MB' },
          ],
          install: 'sudo dpkg -i codeforge-ide-*.deb',
        },
        macos: {
          label: 'macOS',
          icon: '🍎',
          formats: [
            { name: '.dmg (Intel)', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-darwin-x64.dmg`, size: '~130 MB' },
            { name: '.dmg (Apple Silicon)', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-darwin-arm64.dmg`, size: '~125 MB' },
          ],
          install: 'open codeforge-ide-*.dmg',
        },
        windows: {
          label: 'Windows',
          icon: '🪟',
          formats: [
            { name: '.exe', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-win32-x64.exe`, size: '~125 MB' },
            { name: '.msi', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-win32-x64.msi`, size: '~120 MB' },
            { name: '.zip', url: `${RELEASE_URL}/download/ide-v1.0.0/codeforge-ide-1.0.0-win32-x64.zip`, size: '~115 MB' },
          ],
          install: 'Run the installer or extract the .zip',
        },
      },
      features: [
        { icon: '🤖', title: '5 AI Agents', description: 'Planner, Coder, Debugger, Reviewer, and Explainer built-in.' },
        { icon: '🔗', title: 'Sidebar Chat', description: 'Integrated AI chat panel with model switching.' },
        { icon: '✨', title: 'CodeLens Actions', description: 'Inline "Explain" and "Review" buttons above code.' },
        { icon: '🚀', title: 'Auto Mode', description: 'Automatically picks the best model for each task.' },
        { icon: '🔄', title: 'Silent Fallback', description: 'Falls back to alternative models if one is down.' },
        { icon: '📦', title: 'Extension Ready', description: 'Install any VS Code extension from Open VSX.' },
      ],
    },
    cli: {
      name: 'CodeForge CLI',
      tagline: 'AI-powered coding assistant for the terminal. No API keys required.',
      icon: '⌨️',
      downloads: {
        linux: {
          label: 'Linux',
          icon: '🐧',
          formats: [
            { name: '.tar.gz (x64)', url: `${RELEASE_URL}/download/cli-v1.0.0/codeforge-1.0.0-linux-x64.tar.gz`, size: '~224 KB' },
            { name: '.tar.gz (ARM64)', url: `${RELEASE_URL}/download/cli-v1.0.0/codeforge-1.0.0-linux-arm64.tar.gz`, size: '~224 KB' },
          ],
          install: siteUrl ? `curl -fsSL ${siteUrl}/install.sh | bash` : '',
        },
        macos: {
          label: 'macOS',
          icon: '🍎',
          formats: [
            { name: '.tar.gz (Intel)', url: `${RELEASE_URL}/download/cli-v1.0.0/codeforge-1.0.0-darwin-x64.tar.gz`, size: '~224 KB' },
            { name: '.tar.gz (Apple Silicon)', url: `${RELEASE_URL}/download/cli-v1.0.0/codeforge-1.0.0-darwin-arm64.tar.gz`, size: '~224 KB' },
          ],
          install: siteUrl ? `curl -fsSL ${siteUrl}/install.sh | bash` : '',
        },
        windows: {
          label: 'Windows',
          icon: '🪟',
          formats: [
            { name: '.zip (x64)', url: `${RELEASE_URL}/download/cli-v1.0.0/codeforge-1.0.0-windows-x64.zip`, size: '~325 KB' },
            { name: '.zip (ARM64)', url: `${RELEASE_URL}/download/cli-v1.0.0/codeforge-1.0.0-windows-arm64.zip`, size: '~326 KB' },
          ],
          install: siteUrl ? `irm ${siteUrl}/install.ps1 | iex` : '',
        },
      },
      features: [
        { icon: '🚀', title: 'No API Keys', description: 'Start coding with AI immediately, no setup needed.' },
        { icon: '💬', title: 'Interactive TUI', description: 'Beautiful terminal interface with session management.' },
        { icon: '🤖', title: '5 Agents', description: 'Planner, Coder, Debugger, Reviewer, Explainer.' },
        { icon: '🔄', title: 'Auto Mode', description: 'Intelligent model selection for each task.' },
        { icon: '📊', title: 'Usage Stats', description: 'Track token usage and costs over time.' },
        { icon: '🌍', title: 'Cross-Platform', description: 'Works on Linux, macOS, and Windows.' },
      ],
    },
    vscode: {
      name: 'VS Code Extension',
      tagline: 'Bring CodeForge AI agents into your existing VS Code workflow.',
      icon: '🧩',
      downloads: {
        linux: {
          label: 'All Platforms',
          icon: '📦',
          formats: [
            { name: '.vsix', url: `${RELEASE_URL}/download/ext-v1.0.0/codeforge-ai-1.0.0.vsix`, size: '~14 KB' },
          ],
          install: 'code --install-extension codeforge-ai-1.0.0.vsix',
        },
      },
      features: [
        { icon: '🔌', title: 'Drop-in Plugin', description: 'Install the .vsix file in any VS Code or VSCodium.' },
        { icon: '🤖', title: '5 AI Agents', description: 'Full agent support from the sidebar panel.' },
        { icon: '✨', title: 'CodeLens', description: 'Inline AI actions above functions and classes.' },
        { icon: '💬', title: 'Chat Panel', description: 'Integrated chat with model switching and history.' },
        { icon: '🔄', title: 'Auto Mode', description: 'Best model selected automatically per task.' },
        { icon: '🆓', title: 'Free Models', description: 'Uses free OpenRouter models, no API key needed.' },
      ],
    },
  })

  const products = getProducts()
  const product = products[activeProduct]
  const platformData = (product.downloads as Record<string, typeof product.downloads[keyof typeof product.downloads]>)[activePlatform]

  const installCommands = {
    linux: siteUrl ? `curl -fsSL ${siteUrl}/install.sh | bash` : '',
    macos: siteUrl ? `curl -fsSL ${siteUrl}/install.sh | bash` : '',
    windows: siteUrl ? `irm ${siteUrl}/install.ps1 | iex` : '',
    npm: 'npm install -g codeforge-cli',
  }

  const copyInstall = () => {
    if (platformData?.install) {
      navigator.clipboard.writeText(platformData.install)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary to-green bg-clip-text text-transparent">
            CodeForge AI
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            AI-powered coding tools for developers. No API keys required. Free forever.
          </p>

          {/* Product Selector */}
          <div className="flex justify-center gap-3 mb-8">
            {(Object.keys(products) as ProductKey[]).map((key) => (
              <button
                key={key}
                onClick={() => { setActiveProduct(key); setActivePlatform('linux') }}
                className={`px-6 py-3 rounded-xl border transition-all text-sm font-medium ${
                  activeProduct === key
                    ? 'bg-primary border-primary text-white shadow-lg shadow-primary/25'
                    : 'bg-card border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="mr-2">{products[key].icon}</span>
                {products[key].name}
              </button>
            ))}
          </div>

          <p className="text-gray-400 mb-8">{product.tagline}</p>

          {/* Platform Tabs */}
          <div className="flex justify-center gap-2 mb-6">
            {Object.keys(product.downloads).map((plat) => {
              const pd = (product.downloads as Record<string, typeof product.downloads[keyof typeof product.downloads]>)[plat]
              return (
              <button
                key={plat}
                onClick={() => setActivePlatform(plat)}
                className={`px-4 py-2 rounded-lg border transition-all text-sm ${
                  activePlatform === plat
                    ? 'bg-green border-green text-white'
                    : 'bg-card border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {pd.icon}{' '}
                {pd.label}
              </button>
            )})}
          </div>

          {/* Download Cards */}
          {platformData && (
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl p-6 max-w-2xl mx-auto">
              <div className="grid gap-3">
                {platformData.formats.map((fmt, i) => (
                  <a
                    key={i}
                    href={fmt.url}
                    download
                    className="flex items-center justify-between p-4 bg-card border border-gray-800 rounded-xl hover:border-primary transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{product.icon}</span>
                      <div className="text-left">
                        <div className="font-medium text-white group-hover:text-primary transition-colors">
                          {fmt.name}
                        </div>
                        <div className="text-xs text-gray-500">{fmt.size}</div>
                      </div>
                    </div>
                    <span className="px-4 py-2 bg-primary rounded-lg text-white text-sm font-medium group-hover:bg-primary/80 transition-colors">
                      Download
                    </span>
                  </a>
                ))}
              </div>

              {/* Install Command */}
              {platformData.install && (
                <div className="mt-4 relative">
                  <div className="text-xs text-gray-500 mb-2">Or install via terminal:</div>
                  <div className="bg-[#0d0d0d] rounded-lg p-3 pr-20 font-mono text-sm text-green break-all">
                    {platformData.install}
                  </div>
                  <button
                    onClick={copyInstall}
                    className="absolute right-2 top-7 bg-card border border-gray-700 rounded-md px-3 py-1.5 text-xs text-gray-400 hover:bg-primary hover:text-white hover:border-primary transition-all"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-card">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            {product.icon} {product.name} Features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {product.features.map((feature, i) => (
              <div
                key={i}
                className="bg-dark border border-gray-800 rounded-xl p-8 hover:border-primary transition-all hover:-translate-y-1"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* All Products Overview */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Choose Your Experience</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {(Object.keys(products) as ProductKey[]).map((key) => {
              const p = products[key]
              return (
                <button
                  key={key}
                  onClick={() => { setActiveProduct(key); setActivePlatform('linux') }}
                  className={`text-left bg-card border rounded-2xl p-8 transition-all hover:-translate-y-1 ${
                    activeProduct === key
                      ? 'border-primary shadow-lg shadow-primary/10'
                      : 'border-gray-800 hover:border-gray-600'
                  }`}
                >
                  <div className="text-5xl mb-4">{p.icon}</div>
                  <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{p.tagline}</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(p.downloads).map((plat) => {
                      const pd = (p.downloads as Record<string, typeof p.downloads[keyof typeof p.downloads]>)[plat]
                      return (
                      <span key={plat} className="px-2 py-1 bg-dark rounded text-xs text-gray-500">
                        {pd.icon} {pd.label}
                      </span>
                    )})}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-gray-800">
        <div className="max-w-4xl mx-auto text-center text-gray-500">
          <p>
            Built with ❤️ by{' '}
            <a href="https://github.com/codeforge-ai" className="text-primary hover:underline">
              CodeForge AI Team
            </a>
          </p>
          <p className="mt-2">Licensed under MIT</p>
        </div>
      </footer>
    </main>
  )
}
