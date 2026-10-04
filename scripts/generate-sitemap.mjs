/**
 * Build-time sitemap enrichment from public Supabase catalog.
 * Falls back to static core URLs when env is missing/unavailable.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const SITE = 'https://athar.qd.je'

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function urlEntry(loc, { changefreq = 'weekly', priority = '0.7' } = {}) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

async function fetchPublicCatalog() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !anonKey) return { products: [], categories: [] }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  }

  try {
    const [productsRes, categoriesRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/products?select=slug,updated_at&is_active=eq.true&order=updated_at.desc&limit=500`,
        { headers },
      ),
      fetch(
        `${supabaseUrl}/rest/v1/categories?select=slug,updated_at&is_active=eq.true&order=sort_order.asc&limit=200`,
        { headers },
      ),
    ])

    const products = productsRes.ok ? await productsRes.json() : []
    const categories = categoriesRes.ok ? await categoriesRes.json() : []
    return {
      products: Array.isArray(products) ? products : [],
      categories: Array.isArray(categories) ? categories : [],
    }
  } catch {
    return { products: [], categories: [] }
  }
}

export async function generateSitemapXml() {
  const { products, categories } = await fetchPublicCatalog()
  const seen = new Set()
  const entries = []

  function push(loc, opts) {
    if (!loc || seen.has(loc)) return
    seen.add(loc)
    entries.push(urlEntry(loc, opts))
  }

  // Core public routes always present, even when Supabase env is unavailable.
  push(`${SITE}/`, { changefreq: 'daily', priority: '1.0' })
  push(`${SITE}/products`, { changefreq: 'daily', priority: '0.9' })
  push(`${SITE}/return-policy`, { changefreq: 'yearly', priority: '0.4' })
  push(`${SITE}/terms`, { changefreq: 'yearly', priority: '0.4' })

  for (const category of categories) {
    const slug = typeof category?.slug === 'string' ? category.slug.trim() : ''
    if (!slug) continue
    push(`${SITE}/category/${encodeURIComponent(slug)}`, {
      changefreq: 'weekly',
      priority: '0.8',
    })
  }

  for (const product of products) {
    const slug = typeof product?.slug === 'string' ? product.slug.trim() : ''
    if (!slug) continue
    // Never emit UUID product paths — slug-only public URLs.
    push(`${SITE}/products/${encodeURIComponent(slug)}`, {
      changefreq: 'weekly',
      priority: '0.7',
    })
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`
}

const xml = await generateSitemapXml()
const outPublic = path.join(root, 'public', 'sitemap.xml')
const outDist = path.join(root, 'dist', 'sitemap.xml')
fs.writeFileSync(outPublic, xml, 'utf8')
if (fs.existsSync(path.join(root, 'dist'))) {
  fs.writeFileSync(outDist, xml, 'utf8')
}
console.log(`sitemap.xml written (${(xml.match(/<url>/g) || []).length} urls)`)
