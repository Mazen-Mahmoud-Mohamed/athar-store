import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/** GitHub Pages serves project sites at /<repo>/ — copy index.html to 404.html for SPA deep links. */
function githubPagesSpaFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    closeBundle() {
      const distDir = path.resolve(rootDir, 'dist')
      const indexHtml = path.join(distDir, 'index.html')
      const fallbackHtml = path.join(distDir, '404.html')
      if (fs.existsSync(indexHtml)) {
        fs.copyFileSync(indexHtml, fallbackHtml)
      }
    },
  }
}

export default defineConfig({
  // Custom domain athar.qd.je serves the site at domain root (not /athar-store/).
  // GitHub Pages redirects github.io/athar-store/ → http://athar.qd.je/
  base: '/',
  plugins: [react(), tailwindcss(), githubPagesSpaFallback()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
