// Local test transport: production handlers and XPay validation run unchanged;
// Supabase transport is replaced with SQL against the disposable test database.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { AsyncLocalStorage } from 'node:async_hooks'

export async function loadHandlers(client) {
  const previousDeno = globalThis.Deno
  const previousFetch = globalThis.fetch
  const secret = 'whsec_local_regression_fixture'
  const env = { XPAY_MODE: 'test', XPAY_WEBHOOK_SECRET: secret, XPAY_SECRET_KEY: 'sk_test_local_fixture', SUPABASE_SERVICE_ROLE_KEY: 'local_service_fixture' }
  let handler
  const requestClient = new AsyncLocalStorage()
  globalThis.Deno = { env: { get: key => env[key] }, serve: fn => { handler = fn } }
  globalThis.fetch = () => { throw new Error('Network is disabled in handler tests') }
  // Identifiers originate exclusively from checked-in handlers, never test request data.
  const identifier = value => {
    assert.match(value, /^[a-z_][a-z_0-9]*$/)
    return `"${value}"`
  }
  const execute = async (sql, values) => {
    try { return { data: (await (requestClient.getStore() ?? client).query(sql, values)).rows, error: null } }
    catch (error) { return { data: null, error } }
  }
  globalThis.__atharTestService = {
    async rpc(name, args) {
      const entries = Object.entries(args)
      return execute(`select public.${identifier(name)}(${entries.map(([key], i) =>
        `${identifier(key)} => $${i+1}`).join(',')})`, entries.map(([, value]) =>
          value !== null && typeof value === 'object' ? JSON.stringify(value) : value))
    },
    from(table) {
      let columns = '*'
      let mutation
      let update
      const filters = []
      const builder = {
        select(value) { columns = value.split(',').map(s => identifier(s.trim())).join(','); return builder },
        eq(key, value) { filters.push([key,value]); return builder },
        in(key, value) { filters.push([key,value,true]); return builder },
        order() { return builder },
        insert(value) { mutation = value; return builder },
        update(value) { update = value; return builder },
        async run() {
          if (update) {
            const entries = Object.entries(update)
            return execute(`update ${identifier(table)} set ${entries.map(([key],i)=>`${identifier(key)}=$${i+1}`).join(',')}
              where ${filters.map(([key,,many],i)=>`${identifier(key)}${many?'=any(':'='}$${entries.length+i+1}${many?')':''}`).join(' and ')}`,
            [...entries.map(([,value])=>value),...filters.map(([,value])=>value)])
          }
          if (mutation) {
            const entries = Object.entries(mutation)
            return execute(`insert into ${identifier(table)} (${entries.map(([k]) => identifier(k)).join(',')})
              values (${entries.map((_,i) => `$${i+1}`).join(',')})`, entries.map(([,v]) => v))
          }
          return execute(`select ${columns} from ${identifier(table)}${filters.length ? ' where ' : ''}${
            filters.map(([k],i) => `${identifier(k)}=$${i+1}`).join(' and ')}`, filters.map(([,v]) => v))
        },
        async maybeSingle() {
          const result = await builder.run()
          if (result.data?.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Multiple rows' } }
          return { ...result, data: result.data?.[0] ?? null }
        },
        single() { return builder.maybeSingle() },
        then(resolve, reject) { return builder.run().then(resolve,reject) },
      }
      return builder
    },
  }
  async function load(name) {
    const file = new URL(`../supabase/functions/${name}/index.ts`, import.meta.url)
    let source = await readFile(file, 'utf8')
    source = source.replace("import { createServiceClient } from '../_shared/supabaseAdmin.ts'",
      'const createServiceClient = () => globalThis.__atharTestService')
    source = source.replace("import { createServiceClient, storefrontBaseUrl } from '../_shared/supabaseAdmin.ts'",
      'const createServiceClient = () => globalThis.__atharTestService; const storefrontBaseUrl = () => "http://localhost"')
    source = source.replaceAll("'../_shared/cors.ts'", JSON.stringify(new URL('../_shared/cors.ts', file).href))
    source = source.replaceAll("'../_shared/xpay.ts'", JSON.stringify(new URL('../_shared/xpay.ts', file).href))
    source = source.replaceAll("'../_shared/xpayWebhookProcessor.ts'", JSON.stringify(new URL('../_shared/xpayWebhookProcessor.ts', file).href))
    await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
    return handler
  }
  const webhook = await load('xpay-webhook')
  const status = await load('xpay-payment-status')
  const worker = await load('xpay-process-webhook-inbox')
  const create = await load('xpay-create-payment')
  return {
    async create() {
      return create(new Request('http://localhost/create', {method:'POST',body:'{}'}))
    },
    async worker(authorized = true, connection = client) {
      return requestClient.run(connection, () => worker(new Request('http://localhost/worker', {
        method: 'POST', headers: { Authorization: authorized ? 'Bearer local_service_fixture' : 'Bearer invalid' },
      })))
    },
    async webhook(event, signatureValid = true, connection = client) {
      const body = JSON.stringify(event)
      const timestamp = Math.floor(Date.now()/1000)
      const signature = createHmac('sha256', signatureValid ? secret : 'wrong-fixture')
        .update(`${timestamp}.${body}`).digest('hex')
      return requestClient.run(connection, () => webhook(new Request('http://localhost/webhook', {
        method: 'POST', body, headers: { 'XPay-Signature': `t=${timestamp},v1=${signature}` },
      })))
    },
    async status(body, session) {
      globalThis.fetch = async (url, options) => {
        assert.equal(options.method, 'GET')
        assert.equal(url, `https://api.xpay.app/checkout/sessions/${session.id}`)
        return new Response(JSON.stringify(session))
      }
      try {
        return await status(new Request('http://localhost/status', { method: 'POST', body: JSON.stringify(body) }))
      } finally {
        globalThis.fetch = () => { throw new Error('Network is disabled in handler tests') }
      }
    },
    close() {
      globalThis.Deno = previousDeno
      globalThis.fetch = previousFetch
      delete globalThis.__atharTestService
    },
  }
}
