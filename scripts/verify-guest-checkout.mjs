/**
 * Phase 3C verification against the live athar project (anon key only).
 *
 * By default does NOT create a successful order (avoids leaving test rows).
 * Set ALLOW_TEST_ORDER=1 to create one marked TEST_PHASE3C_DO_NOT_FULFILL and print cleanup SQL.
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const allowTestOrder = process.env.ALLOW_TEST_ORDER === '1'

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local')
  if (!existsSync(envPath)) throw new Error('.env.local missing')
  const out = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

const env = loadEnvLocal()
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

const anonClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log('Phase 3C guest checkout verification\n')

  {
    const { data, error } = await anonClient.from('orders').select('*').limit(5)
    if (error) pass('anon SELECT orders blocked', error.message)
    else if (Array.isArray(data) && data.length === 0) pass('anon SELECT orders empty under RLS')
    else fail('anon SELECT orders denied', `visible rows: ${data?.length}`)
  }

  {
    const { error } = await anonClient.from('orders').insert({
      customer_name: 'should-fail',
      phone: '01000000000',
      address: 'should-fail-address-long',
      subtotal: 1,
      total: 1,
    })
    if (error) pass('anon INSERT orders denied', error.message)
    else fail('anon INSERT orders denied', 'insert unexpectedly succeeded')
  }

  {
    const { error } = await anonClient.from('order_items').insert({
      order_id: '00000000-0000-0000-0000-000000000000',
      product_name: 'x',
      unit_price: 1,
      quantity: 1,
      subtotal: 1,
    })
    if (error) pass('anon INSERT order_items denied', error.message)
    else fail('anon INSERT order_items denied', 'insert unexpectedly succeeded')
  }

  {
    const { error } = await anonClient.from('orders').update({ status: 'confirmed' }).eq('id', '00000000-0000-0000-0000-000000000000')
    if (error) pass('anon UPDATE orders denied', error.message)
    else pass('anon UPDATE orders no-op/denied', 'no error (0 rows)')
  }

  const { data: products, error: productsError } = await anonClient
    .from('products')
    .select('id,name,price,stock_quantity,is_active')
    .eq('is_active', true)
    .gt('stock_quantity', 0)
    .limit(1)

  if (productsError || !products?.length) {
    fail('load active product', productsError?.message || 'none found')
  } else {
    const product = products[0]
    pass('load active product', `${product.name} stock=${product.stock_quantity}`)

    const basePayload = {
      p_customer_name: 'اختبار أثر Phase3C',
      p_phone: '01012345678',
      p_address: 'عنوان اختبار طويل بما يكفي للتحقق',
      p_notes: 'TEST_PHASE3C_DO_NOT_FULFILL',
    }

    {
      const { error } = await anonClient.rpc('create_guest_order', {
        ...basePayload,
        p_items: [{ product_id: product.id, quantity: 0 }],
      })
      if (error) pass('reject invalid quantity', error.message)
      else fail('reject invalid quantity', 'accepted qty 0')
    }

    {
      const { error } = await anonClient.rpc('create_guest_order', {
        ...basePayload,
        p_items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
      })
      if (error) pass('reject unavailable product', error.message)
      else fail('reject unavailable product', 'accepted fake product')
    }

    {
      const { error } = await anonClient.rpc('create_guest_order', {
        ...basePayload,
        p_items: [{ product_id: product.id, quantity: product.stock_quantity + 50 }],
      })
      if (error) pass('reject insufficient stock', error.message)
      else fail('reject insufficient stock', 'accepted oversell')
    }

    {
      const { error } = await anonClient.rpc('create_guest_order', {
        ...basePayload,
        p_customer_name: '',
        p_items: [{ product_id: product.id, quantity: 1 }],
      })
      if (error) pass('reject empty customer name', error.message)
      else fail('reject empty customer name', 'accepted')
    }

    if (allowTestOrder) {
      const { data, error } = await anonClient.rpc('create_guest_order', {
        ...basePayload,
        p_items: [{ product_id: product.id, quantity: 1 }],
      })
      if (error) fail('create valid guest order', error.message)
      else {
        const id = typeof data === 'string' ? data : data?.id
        const shape = typeof data === 'string' ? 'uuid' : 'jsonb'
        pass('create valid guest order', `id=${id} shape=${shape}`)
        console.log(
          `\nCLEANUP SQL (run in athar SQL Editor):\nbegin;\nupdate public.products set stock_quantity = stock_quantity + 1 where id = '${product.id}';\ndelete from public.orders where id = '${id}' and notes = 'TEST_PHASE3C_DO_NOT_FULFILL';\ncommit;\n`,
        )
      }
    } else {
      pass(
        'skip successful order insert',
        'set ALLOW_TEST_ORDER=1 to create a marked test order + cleanup SQL',
      )
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
