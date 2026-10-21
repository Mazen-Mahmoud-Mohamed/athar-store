// Browser regressions against the actual storefront with local catalog fixtures.
// No .env files, production connections, payments, builds or deployment hooks.
// Usage: node scripts/test-route-scroll.mjs [path/to/playwright/index.mjs]
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const { chromium } = await import(process.argv[2]
  ? pathToFileURL(path.resolve(process.argv[2])).href : 'playwright')
const fakeOrigin = 'https://athar-scroll-fixture.supabase.co'
const fixtureModule = `
import React, { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { RouteScroll } from '/src/components/RouteScroll.tsx';
const h = React.createElement;
function LongPage() {
  const navigate = useNavigate();
  return h('div', {style:{height:6000}},
    h('button', {id:'filter',onClick:()=>navigate('?filter=1',{replace:true})}, 'Filter'),
    h('div',{id:'anchor',style:{marginTop:2200}},'Anchor'));
}
function DeferredPage() {
  const [ready,setReady] = useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setReady(true),600);return ()=>clearTimeout(timer)},[]);
  return ready ? h('div',{id:'ready',style:{height:6000}},
    h('div',{id:'late-anchor',style:{paddingTop:2400}},h('span',{id:'target'},'Late anchor')))
    : h('p',null,'Loading data');
}
const LazyPage = lazy(()=>new Promise(resolve=>setTimeout(()=>resolve({default:DeferredPage}),400)));
createRoot(document.getElementById('root')).render(h(StrictMode,null,h(BrowserRouter,null,
  h(RouteScroll),
  h('nav',{style:{position:'fixed',top:0}},
    h(Link,{id:'long',to:'/__scroll_test/long'},'Long'), ' ',
    h(Link,{id:'lazy',to:'/__scroll_test/lazy'},'Lazy'), ' ',
    h(Link,{id:'hash',to:'/__scroll_test/lazy#target'},'Delayed anchor'), ' ',
    h(Link,{id:'short',to:'/__scroll_test/short'},'Short')),
  h(Suspense,{fallback:h('p',null,'Loading route')},h(Routes,null,
    h(Route,{path:'/__scroll_test/long',element:h(LongPage)}),
    h(Route,{path:'/__scroll_test/lazy',element:h(LazyPage)}),
    h(Route,{path:'/__scroll_test/short',element:h('p',null,'Short page')}))))));
`
const server = await createServer({
  configFile: false, envDir: false,
  plugins: [react(), tailwindcss(), {
    name: 'local-scroll-fixture',
    configureServer(devServer) {
      devServer.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/__scroll_test/')) {
          res.setHeader('Content-Type', 'text/html')
          res.end('<!doctype html><div id="root"></div><script type="module" src="/__scroll_fixture.js"></script>')
        } else next()
      })
    },
    resolveId(id) { if (id === '/__scroll_fixture.js') return '\0scroll-fixture.js' },
    load(id) { if (id === '\0scroll-fixture.js') return fixtureModule },
  }],
  resolve: { alias: { '@': path.resolve('src') } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(fakeOrigin),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('sb_publishable_local_scroll_fixture_only'),
  },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  logLevel: 'error',
})
let browser
let passed = 0
try {
  await server.listen()
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const category = { id: '11111111-1111-4111-8111-111111111111', name: 'Local bags',
    slug: 'local-bags', is_active: true, sort_order: 0, image_url: null }
  const products = Array.from({ length: 24 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
    name: `Local bag ${i+1}`, slug: `local-bag-${i+1}`, price: 100, old_price: 150,
    description: 'Locally generated catalog fixture. '.repeat(15), image_url: null,
    stock_quantity: 10, category_id: category.id, category,
    is_active: true, is_new: true, is_featured: true, created_at: '2026-01-01T00:00:00Z',
  }))
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const label = viewport.width === 390 ? 'mobile' : 'desktop'
    const context = await browser.newContext({ viewport, isMobile: label === 'mobile',
      hasTouch: label === 'mobile', serviceWorkers: 'block' })
    context.setDefaultTimeout(12_000)
    const errors = []
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== fakeOrigin) return route.abort()
      assert.equal(route.request().method(), 'GET', 'Only read-only local catalog requests are allowed')
      await delay(250)
      let rows = url.pathname.endsWith('/categories') ? [category] : products
      for (const key of ['id','slug','category_id']) {
        const filter = url.searchParams.get(key)
        if (filter?.startsWith('eq.')) rows = rows.filter(row => row[key] === filter.slice(3))
      }
      const single = route.request().headers().accept?.includes('vnd.pgrst.object')
      return route.fulfill({ json: single ? rows[0] ?? null : rows })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    async function check(name, fn) {
      await fn()
      passed++
      console.log(`PASS ${label}: ${name}`)
    }
    async function atTop() {
      await page.waitForFunction(() => window.scrollY === 0)
    }
    async function scrollTo(y) {
      await page.evaluate(top => window.scrollTo({top, behavior:'instant'}), y)
      await page.waitForTimeout(100)
    }
    async function productReady() {
      await page.locator('h1').filter({ hasText: 'Local bag' }).waitFor()
    }
    async function clickProduct(selector) {
      const link = page.locator(selector).first()
      await link.scrollIntoViewIfNeeded()
      await page.waitForTimeout(100)
      const from = await page.evaluate(() => window.scrollY)
      assert.ok(from > 100, 'test must navigate from a scrolled page')
      await link.click()
      await atTop()
      await productReady()
      await atTop()
      return from
    }
    await check('homepage product title opens at top after delayed data', async () => {
      await page.goto(origin)
      await clickProduct('article a:has(h3)')
    })
    await check('listing product image; Back and Forward restore entry positions', async () => {
      await page.goto(`${origin}/products`)
      await page.locator('article').nth(16).waitFor()
      const card = page.locator('article').nth(16).locator('a').first()
      await card.scrollIntoViewIfNeeded()
      await page.waitForTimeout(100)
      const listingY = await page.evaluate(() => window.scrollY)
      assert.ok(listingY > 1000)
      await card.click()
      await productReady()
      await atTop()
      await scrollTo(500)
      const productY = await page.evaluate(() => window.scrollY)
      await page.goBack()
      await page.waitForFunction(y => Math.abs(window.scrollY-y)<3, listingY)
      await page.goForward()
      await productReady()
      await page.waitForFunction(y => Math.abs(window.scrollY-y)<3, productY)
    })
    await check('category and related-product links open at top', async () => {
      await page.goto(`${origin}/category/local-bags`)
      await page.locator('article').nth(12).waitFor()
      await clickProduct('article:nth-child(13) a:has(h3)')
      await clickProduct('section[aria-labelledby="related-heading"] article a:has(h3)')
    })
    await check('cart product links and UUID-to-slug replacement open at top', async () => {
      await page.evaluate(rows => localStorage.setItem('athar-cart-v1', JSON.stringify(rows)),
        products.map(p => ({ productId:p.id, name:p.name, price:p.price, quantity:1 })))
      await page.goto(`${origin}/cart`)
      await clickProduct(`main a[href="/products/${products[12].id}"]`)
      assert.ok(page.url().endsWith('/products/local-bag-13'))
    })
    await check('homepage anchors and normal page navigation', async () => {
      await page.goto(origin)
      await page.locator('main a[href="/#categories"]').click()
      await page.waitForFunction(() => Math.abs(document.getElementById('categories').getBoundingClientRect().top)<3)
      await page.locator('a.skip-link').evaluate(link => link.click())
      await page.waitForFunction(() => Math.abs(document.getElementById('main-content').getBoundingClientRect().top)<3)
      await page.locator('footer a[href="/return-policy"]').click()
      await page.waitForURL('**/return-policy')
      await atTop()
    })
    await check('lazy route, delayed anchor, and same-page filter replacement', async () => {
      await page.goto(`${origin}/__scroll_test/long`)
      await scrollTo(1800)
      await page.locator('#filter').evaluate(button => button.click())
      await page.waitForTimeout(100)
      assert.equal(await page.evaluate(() => window.scrollY),1800)
      await page.locator('#lazy').click()
      await atTop()
      await page.locator('#ready').waitFor()
      await atTop()
      await page.locator('#long').click()
      await scrollTo(1800)
      await page.locator('#hash').click()
      await page.waitForFunction(() => {
        const target=document.getElementById('target')
        return target && Math.abs(target.getBoundingClientRect().top)<3
      })
    })
    await check('Back restores delayed content; user input cancels pending restoration', async () => {
      await page.goto(`${origin}/__scroll_test/lazy`)
      await page.locator('#ready').waitFor()
      await scrollTo(3000)
      await page.locator('#short').click()
      await atTop()
      await page.goBack()
      await page.waitForFunction(() => Math.abs(window.scrollY-3000)<3)
      await page.locator('#short').click()
      await page.goBack()
      await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')))
      await page.locator('#ready').waitFor()
      await page.waitForTimeout(100)
      assert.ok(await page.evaluate(() => window.scrollY)<100, 'must not fight user input')
    })
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log(`\n${passed} browser regression groups passed; external network blocked.`)
} finally {
  await browser?.close()
  await server.close()
}
