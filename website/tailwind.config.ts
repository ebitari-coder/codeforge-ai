import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#569cd6',
        green: '#4caf50',
        dark: '#1e1e1e',
        card: '#2d2d2d',
      },
    },
  },
  plugins: [],
}
export default config
