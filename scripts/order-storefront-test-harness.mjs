// Exercise the actual services, storage and rendered page without a browser,
// environment files, Supabase or provider requests.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

export async function testStorefront(test) {
  const sourceRoot = new URL('../src/', import.meta.url)
  const supabaseFile = new URL('lib/supabase.ts', sourceRoot).href
  const previousStorage = globalThis.sessionStorage
  const previousFetch = globalThis.fetch
  const stored = new Map()
  globalThis.sessionStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key),
  }
  globalThis.fetch = () => { throw new Error('Network is disabled in storefront tests') }
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
      const target = fileURLToPath(new URL(specifier.slice(2), sourceRoot))
      const file = ['', '.ts', '.tsx', '/index.ts'].map(suffix => target + suffix)
        .find(candidate => existsSync(candidate))
      assert.ok(file, `Unresolved source import: ${specifier}`)
      return { url: pathToFileURL(file).href, shortCircuit: true }
    },
    load(url, context, nextLoad) {
      if (url === supabaseFile) {
        return { format: 'module', shortCircuit: true, source: `
          export const isSupabaseConfigured = true;
          export const requireSupabase = () => ({ functions: { invoke: async () =>
            ({ data: globalThis.__atharStorefrontResponse, error: null }) } });
        ` }
      }
      if (url.startsWith(sourceRoot.href) && url.endsWith('.png')) {
        return { format: 'module', shortCircuit: true, source: 'export default "/local-test-logo.png"' }
      }
      if (url.startsWith(sourceRoot.href) && /\.tsx?$/.test(url)) {
        const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX },
        }).outputText
        return { format: 'module', shortCircuit: true, source }
      }
      return nextLoad(url, context)
    },
  })
  try {
    const { fetchXPayPaymentStatus, rememberPendingXPayPayment, clearPendingXPayPayment,
      readPendingXPayPayment } = await import('../src/services/paymentService.ts')
    const { rememberGuestOrderConfirmation, readRememberedGuestOrderConfirmation } =
      await import('../src/services/orderService.ts')
    const { OrderSuccessPage } = await import('../src/pages/OrderSuccessPage.tsx')
    const base = { id: '00000000-0000-0000-0000-000000000001', reference: 'أثر-000001',
      status: 'pending', customerName: 'Local fixture', subtotal: 200, total: 200,
      items: [], paymentMethod: 'xpay', paymentStatus: 'successful' }
    await test('storefront preserves authoritative cancelled state through mapping and refresh', async () => {
      for (const status of ['cancelled', 'confirmed', 'preparing', 'shipped', 'delivered', 'pending']) {
        globalThis.__atharStorefrontResponse = { paymentId: 'local', orderId: base.id,
          paymentStatus: 'successful', orderStatus: status, confirmation: base, verified: true }
        const result = await fetchXPayPaymentStatus({ paymentId: 'local', guestToken: 'local' })
        assert.equal(result.orderStatus, status)
        assert.equal(result.confirmation.status, status)
        rememberGuestOrderConfirmation(result.confirmation)
        rememberPendingXPayPayment({ paymentId: 'local', guestToken: 'local', orderId: base.id,
          confirmation: result.confirmation })
        clearPendingXPayPayment()
        assert.equal(readPendingXPayPayment(), null)
        assert.equal(readRememberedGuestOrderConfirmation().status, status)
      }
      for (const status of [undefined, 'invalid-status']) {
        globalThis.__atharStorefrontResponse.orderStatus = status
        const result = await fetchXPayPaymentStatus({ paymentId: 'local', guestToken: 'local' })
        assert.equal(result.confirmation.status, 'pending')
        rememberGuestOrderConfirmation({ ...base, status })
        assert.equal(readRememberedGuestOrderConfirmation().status, 'pending')
      }
    })
    await test('storefront preserves full and partial refunds through service mapping, refresh and rendering', async () => {
      for (const paymentStatus of ['refunded', 'partially_refunded']) {
        for (const status of ['confirmed', 'cancelled']) {
          globalThis.__atharStorefrontResponse = { paymentId: 'local', orderId: base.id,
            paymentStatus, orderStatus: status, confirmation: base, verified: true }
          const result = await fetchXPayPaymentStatus({ paymentId: 'local', guestToken: 'local' })
          assert.equal(result.confirmation.paymentStatus, paymentStatus)
          assert.equal(result.confirmation.status, status)
          rememberGuestOrderConfirmation(result.confirmation)
          assert.equal(readRememberedGuestOrderConfirmation().paymentStatus, paymentStatus)
          const html = renderToStaticMarkup(createElement(MemoryRouter, {
            initialEntries: [{ pathname: '/order-success', state: { confirmation: result.confirmation } }],
          }, createElement(OrderSuccessPage)))
          assert.ok(html.includes(status === 'cancelled' ? 'تم إلغاء الطلب' : 'تم تحديث حالة الاسترداد'))
          assert.ok(!html.includes('تم الدفع بنجاح'))
          assert.ok(!html.includes('نراجع الطلب ونتواصل لتأكيد موعد التوصيل'))
        }
      }
    })
    await test('rendered storefront distinguishes paid cancellation from paid fulfillment and COD', async () => {
      const render = confirmation => renderToStaticMarkup(createElement(MemoryRouter, {
        initialEntries: [{ pathname: '/order-success', state: { confirmation } }],
      }, createElement(OrderSuccessPage)))
      for (const paymentStatus of ['successful', 'pending']) {
        const html = render({ ...base, status: 'cancelled', paymentStatus })
        assert.ok(html.includes('تم إلغاء الطلب'))
        assert.ok(html.includes('ملغي'))
        assert.ok(html.includes('لن يتم تجهيز هذا الطلب أو شحنه'))
        assert.ok(!html.includes('سنتواصل معكِ بشأن التوصيل'))
        assert.ok(!html.includes('نراجع الطلب ونتواصل لتأكيد موعد التوصيل'))
        if (paymentStatus === 'successful') assert.ok(html.includes('الإلغاء لا يعيد المبلغ تلقائيًا'))
      }
      const paid = render({ ...base, status: 'confirmed' })
      assert.ok(paid.includes('تم الدفع بنجاح'))
      assert.ok(paid.includes('تم التأكيد'))
      assert.ok(paid.includes('نراجع الطلب ونتواصل لتأكيد موعد التوصيل'))
      const cod = render({ ...base, paymentMethod: 'cod', paymentStatus: 'pending' })
      assert.ok(cod.includes('شكراً لطلبكِ من أثر'))
      assert.ok(cod.includes('الدفع عند الاستلام'))
      assert.ok(!cod.includes('تم إلغاء الطلب'))
    })
  } finally {
    hooks.deregister()
    globalThis.sessionStorage = previousStorage
    globalThis.fetch = previousFetch
    delete globalThis.__atharStorefrontResponse
  }
}
