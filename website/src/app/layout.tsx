import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CodeForge AI - AI-Powered Coding Assistant',
  description: 'AI-powered coding assistant for the terminal. No API keys required. Free forever.',
  openGraph: {
    title: 'CodeForge AI - AI-Powered Coding Assistant',
    description: 'AI-powered coding assistant for the terminal. No API keys required. Free forever.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CodeForge AI - AI-Powered Coding Assistant',
    description: 'AI-powered coding assistant for the terminal. No API keys required. Free forever.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif" }}>{children}</body>
    </html>
  )
}
