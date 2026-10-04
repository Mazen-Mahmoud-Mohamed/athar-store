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

/** Enrich sitemap.xml in dist from public catalog when Supabase env is available. */
function generateSitemapPlugin(): Plugin {
  return {
    name: 'generate-sitemap',
    async closeBundle() {
      const { spawnSync } = await import('node:child_process')
      const result = spawnSync(process.execPath, ['scripts/generate-sitemap.mjs'], {
        cwd: rootDir,
        env: process.env,
        encoding: 'utf8',
      })
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
      // Non-fatal: keep the static public/sitemap.xml if enrichment fails.
      if (result.status !== 0) {
        console.warn('[generate-sitemap] skipped enrichment; static sitemap retained')
      }
    },
  }
}

export default defineConfig({
  // Custom domain athar.qd.je serves the site at domain root (not /athar-store/).
  // GitHub Pages redirects github.io/athar-store/ → http://athar.qd.je/
  base: '/',
  plugins: [react(), tailwindcss(), githubPagesSpaFallback(), generateSitemapPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
