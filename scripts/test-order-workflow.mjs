// Executes repository SQL on a fresh loopback-only PostgreSQL cluster.
// Does not read .env, accept a database URL, or contact Supabase/XPay.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import EmbeddedPostgres from 'embedded-postgres'
import { getAllowedStatusTransitions } from '../src/lib/orderStatus.ts'
import { loadHandlers } from './order-handler-test-harness.mjs'
import { testStorefront } from './order-storefront-test-harness.mjs'
import { testRefunds } from './test-xpay-refunds.mjs'
import { prepareReleaseSql } from './order-release-sql.mjs'
import { testEncryptedBackup } from './test-encrypted-backup.mjs'

const portProbe = net.createServer()
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
const port = portProbe.address().port
await new Promise(resolve => portProbe.close(resolve))
const directory = await mkdtemp(path.join(tmpdir(), 'athar-order-tests-'))
// Validate the exact recursive cleanup target before starting the cluster.
assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
assert.ok(path.basename(directory).startsWith('athar-order-tests-'))
const server = new EmbeddedPostgres({
  databaseDir: directory, port, user: 'postgres', password: randomUUID(),
  persistent: true, initdbFlags: ['--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'],
  onLog() {}, onError(message) { console.error(message) },
})
const clients = []
let passed = 0
let db
const adminId = randomUUID()
const customerId = randomUUID()
async function connect(role, uid) {
  const client = server.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  clients.push(client)
  await client.query("set statement_timeout = '8s'")
  if (role) await client.query(`set role ${role}`)
  if (uid) await client.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
  return client
}
async function migration(name) {
  await db.query(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
}
async function test(name, fn) {
  await fn()
  passed++
  console.log(`PASS ${name}`)
}
async function fixture(method = 'xpay') {
  const product = randomUUID()
  await db.query('insert into products(id,name,slug,price,stock_quantity) values($1::uuid,$1::text,$1::text,100,10)', [product])
  const { rows } = await db.query(`select create_guest_order('Test customer','01012345678',
    'Local test address',null,$1::jsonb,$2::payment_method) as result`,
  [JSON.stringify([{ product_id: product, quantity: 2 }]), method])
  const order = rows[0].result.id
  let payment
  if (method === 'xpay') {
    payment = randomUUID()
    await db.query('insert into payments(id,order_id,amount) values($1,$2,200)', [payment, order])
  }
  return { product, order, payment }
}
async function state(f) {
  const { rows } = await db.query(`select o.status, o.payment_status, o.stock_released,
    o.cancellation_source, p.stock_quantity,
    (select status from payments where id=$3) as attempt_status
    from orders o, products p where o.id=$1 and p.id=$2`, [f.order, f.product, f.payment ?? null])
  return rows[0]
}
const adminChange = (client, f, status = 'cancelled') =>
  client.query('select admin_update_order_status($1,$2)', [f.order, status])
const paid = (client, f) => client.query('select mark_xpay_order_paid($1)', [f.payment])
const expire = (client, f) => client.query("select cancel_unpaid_xpay_order($1,'expired')", [f.payment])
const poll = (client, f) => client.query("select sync_xpay_payment_status($1,'requires_action')", [f.payment])
// Hold A's completed write uncommitted; prove B is blocked on a PostgreSQL lock,
// then commit A. Tests exercise BOTH serializations, not timing-dependent Promise.all.
async function race(first, second, opA, opB) {
  await first.query('begin')
  let pending
  try {
    await opA(first)
    const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid
    pending = opB(second).then(value => ({ value }), error => ({ error }))
    let blocked = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const { rows } = await db.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])
      if (rows[0]?.wait_event_type === 'Lock') { blocked = true; break }
      await delay(10)
    }
    assert.ok(blocked, 'second transaction must actually wait for the order lock')
    await first.query('commit')
    const result = await pending
    if (result.error) throw result.error
  } finally {
    await first.query('rollback')
    if (pending) await pending
  }
}

try {
  await server.initialise()
  await server.start()
  db = await connect()
  // Minimal Supabase auth harness; all application schema/RLS/RPCs are real migrations.
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to service_role;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`)
  for (const name of [
    '20261003000001_initial_schema', '20261003000002_rls',
    '20261003000004_guest_order_confirmation', '20261003000005_admin_order_status_workflow',
    '20261004000008_xpay_payments', '20261004000009_xpay_service_role_rpc_grants',
    '20261004000010_xpay_service_role_table_grants', '20261004000011_xpay_service_role_order_read_grants',
  ]) await migration(name)
  await db.query('insert into auth.users(id) values($1),($2)', [adminId, customerId])
  await db.query('delete from profiles where id=$1', [adminId])
  await db.query("insert into profiles(id,role) values($1,'admin')", [adminId])
  const admin = await connect('authenticated', adminId)
  const admin2 = await connect('authenticated', adminId)
  const customer = await connect('authenticated', customerId)
  const anonymous = await connect('anon')
  const service = await connect('service_role')
  const service2 = await connect('service_role')

  const historical = await fixture('cod')
  const historicalExpiry = await fixture()
  const historicalUnpaid = await fixture()
  const historicalPaid = await fixture()
  await test('baseline reproduces missing stock restore and unpaid admin confirmation', async () => {
    await adminChange(admin, historical)
    assert.equal((await db.query('select stock_quantity from products where id=$1', [historical.product])).rows[0].stock_quantity, 8)
    await adminChange(admin, historicalUnpaid, 'confirmed')
    await expire(service, historicalExpiry)
    await paid(service, historicalPaid)
  })
  const historicalTimestamp = (await db.query('select updated_at from orders where id=$1', [historical.order])).rows[0].updated_at
  await db.query('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[])')
  await db.query(await prepareReleaseSql())
  await test('atomic cutover records migrations 012 then 013 then 014 and commits with maintenance active', async () => {
    assert.equal((await service.query('select checkout_maintenance_active() as active')).rows[0].active,true)
    assert.deepEqual((await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version),
      ['20261020000012','20261021000013','20261021000014'])
    await assert.rejects(fixture('cod'), /CHECKOUT_MAINTENANCE/)
    await service.query('select set_checkout_maintenance(false)')
  })

  await test('migration preserves historical stock and already-paid orders', async () => {
    assert.deepEqual((await db.query('select updated_at from orders where id=$1', [historical.order])).rows[0].updated_at, historicalTimestamp)
    assert.equal((await state(historical)).stock_quantity, 8)
    assert.equal((await state(historical)).cancellation_source, 'legacy')
    await adminChange(admin, historical)
    assert.equal((await state(historical)).stock_quantity, 8)
    assert.equal((await state(historicalExpiry)).stock_quantity, 10)
    assert.equal((await state(historicalExpiry)).stock_released, true)
    await paid(service, historicalExpiry)
    assert.equal((await state(historicalExpiry)).stock_quantity, 8)
    await paid(service, historicalPaid)
    await adminChange(admin, historicalPaid, 'preparing')
    assert.equal((await state(historicalPaid)).stock_quantity, 8)
    await assert.rejects(adminChange(admin, historicalUnpaid, 'preparing'), /XPAY_PAYMENT_REQUIRED/)
  })
  await test('maintenance gate blocks checkout and all order/payment writers while inbox intake remains available', async () => {
    await service.query('select set_checkout_maintenance(true)')
    await assert.rejects(fixture('cod'), /CHECKOUT_MAINTENANCE/)
    await assert.rejects(customer.query('select set_checkout_maintenance(true)'), /permission denied/)
    await service.query('select set_checkout_maintenance(false)')
    const f = await fixture('cod')
    assert.ok(f.order)
    const queued = await service.query(`select queue_xpay_webhook_event('evt_test_maintenance','checkout.session.completed','test',
      '{"id":"evt_test_maintenance","type":"checkout.session.completed"}'::jsonb) as state`)
    assert.equal(queued.rows[0].state, 'received')
    const claim = (await service.query("select claim_xpay_webhook_event('evt_test_maintenance') as claim")).rows[0].claim
    await service.query("select mark_xpay_webhook_event_processed('evt_test_maintenance',$1)",[claim.lease_token])
    assert.equal((await db.query("select state from xpay_webhook_inbox where event_id='evt_test_maintenance'")).rows[0].state, 'processed')
  })
  await test('authorization closes browser and service direct financial writes', async () => {
    const f = await fixture()
    await assert.rejects(adminChange(customer, f), /ADMIN_REQUIRED/)
    await assert.rejects(adminChange(anonymous, f), /permission denied/)
    await assert.rejects(paid(admin, f), /permission denied/)
    await assert.rejects(expire(admin, f), /permission denied/)
    await assert.rejects(poll(admin, f), /permission denied/)
    await assert.rejects(admin.query("update orders set payment_status='successful' where id=$1", [f.order]), /permission denied/)
    await assert.rejects(admin.query("update orders set status='cancelled' where id=$1", [f.order]), /permission denied/)
    await assert.rejects(service.query("update orders set payment_status='successful' where id=$1", [f.order]), /permission denied/)
    await assert.rejects(service.query("update payments set status='successful' where id=$1", [f.payment]), /permission denied/)
    await assert.rejects(service.query('select release_order_stock($1)', [f.order]), /permission denied/)
    await service.query("update payments set provider_status='open' where id=$1", [f.payment])
    assert.equal((await state(f)).stock_quantity, 8)
  })
  await test('maintenance activation waits for in-flight financial transactions and then blocks new writes', async () => {
    const f=await fixture()
    await race(service,service2,c=>paid(c,f),c=>c.query('select set_checkout_maintenance(true)'))
    assert.equal((await state(f)).payment_status,'successful')
    await assert.rejects(paid(service,f),/CHECKOUT_MAINTENANCE/)
    await assert.rejects(adminChange(admin,f),/CHECKOUT_MAINTENANCE/)
    await service.query('select set_checkout_maintenance(false)')
  })
  for (const method of ['cod', 'xpay']) {
    await test(`${method}: duplicate and concurrent admin cancellation restores exactly once`, async () => {
      const f = await fixture(method)
      await race(admin, admin2, c => adminChange(c, f), c => adminChange(c, f))
      await adminChange(admin, f)
      assert.equal((await state(f)).stock_quantity, 10)
      assert.equal((await state(f)).stock_released, true)
      await assert.rejects(adminChange(admin, f, 'confirmed'), /INVALID_ORDER_STATUS_TRANSITION/)
    })
  }
  await test('unpaid XPay statuses block every forward transition, including historical advanced orders', async () => {
    for (const paymentStatus of ['pending', 'requires_action', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded']) {
      for (const [from, to] of [['pending','confirmed'], ['confirmed','preparing'], ['preparing','shipped'], ['shipped','delivered']]) {
        const f = await fixture()
        // Fixture-only superuser import simulates a historical state without relaxing triggers.
        await db.query('alter table orders disable trigger orders_enforce_status_transition')
        await db.query('update orders set status=$1,payment_status=$2 where id=$3', [from,paymentStatus,f.order])
        await db.query('alter table orders enable trigger orders_enforce_status_transition')
        await assert.rejects(adminChange(admin,f,to), /XPAY_PAYMENT_REQUIRED/)
        assert.equal((await state(f)).status, from)
      }
    }
  })
  await test('COD pending payment and paid XPay retain full fulfillment flow; shipped cancellation does not restock', async () => {
    for (const method of ['cod','xpay']) {
      const f = await fixture(method)
      if (method === 'xpay') await paid(service,f)
      else await adminChange(admin,f,'confirmed')
      await adminChange(admin,f,'preparing')
      await adminChange(admin,f,'shipped')
      await adminChange(admin,f,'delivered')
      await assert.rejects(adminChange(admin,f), /INVALID_ORDER_STATUS_TRANSITION/)
      assert.equal((await state(f)).stock_quantity,8)
      const shipped = await fixture(method)
      if (method === 'xpay') await paid(service,shipped)
      else await adminChange(admin,shipped,'confirmed')
      await adminChange(admin,shipped,'preparing')
      await adminChange(admin,shipped,'shipped')
      await adminChange(admin,shipped)
      assert.equal((await state(shipped)).stock_quantity,8)
      assert.equal((await state(shipped)).stock_released,false)
    }
  })
  for (const reverse of [false,true]) {
    await test(`admin/expiry race (${reverse ? 'webhook' : 'admin'} first), retries and late success`, async () => {
      const f = await fixture()
      if (reverse) await race(service,admin,c => expire(c,f),c => adminChange(c,f))
      else await race(admin,service,c => adminChange(c,f),c => expire(c,f))
      await expire(service,f)
      assert.equal((await state(f)).stock_quantity,10)
      await paid(service,f)
      await paid(service,f)
      assert.equal((await state(f)).status,'cancelled')
      assert.equal((await state(f)).payment_status,'successful')
      assert.equal((await state(f)).stock_quantity,10)
    })
    await test(`admin/paid race (${reverse ? 'webhook' : 'admin'} first) never resurrects admin cancellation`, async () => {
      const f = await fixture()
      if (reverse) await race(service,admin,c => paid(c,f),c => adminChange(c,f))
      else await race(admin,service,c => adminChange(c,f),c => paid(c,f))
      await expire(service,f)
      assert.equal((await state(f)).status,'cancelled')
      assert.equal((await state(f)).payment_status,'successful')
      assert.equal((await state(f)).stock_quantity,10)
    })
    await test(`paid/expiry race (${reverse ? 'expiry' : 'paid'} first) retains one reservation`, async () => {
      const f = await fixture()
      if (reverse) await race(service,service2,c => expire(c,f),c => paid(c,f))
      else await race(service,service2,c => paid(c,f),c => expire(c,f))
      assert.equal((await state(f)).status,'confirmed')
      assert.equal((await state(f)).payment_status,'successful')
      assert.equal((await state(f)).stock_quantity,8)
      assert.equal((await state(f)).stock_released,false)
    })
    await test(`stale polling/paid race (${reverse ? 'poll' : 'paid'} first) cannot downgrade payment`, async () => {
      const f = await fixture()
      if (reverse) await race(service,service2,c => poll(c,f),c => paid(c,f))
      else await race(service,service2,c => paid(c,f),c => poll(c,f))
      assert.equal((await state(f)).payment_status,'successful')
      assert.equal((await state(f)).attempt_status,'successful')
      await adminChange(admin,f,'preparing')
    })
  }
  await test('setup compensation and admin cancellation share the release flag', async () => {
    for (const reverse of [false,true]) {
      const f = await fixture()
      const compensate = c => c.query('select cancel_xpay_order_without_payment($1)', [f.order])
      if (reverse) await race(service,admin,compensate,c => adminChange(c,f))
      else await race(admin,service,c => adminChange(c,f),compensate)
      await compensate(service)
      await expire(service,f)
      assert.equal((await state(f)).stock_quantity,10)
    }
    const f = await fixture('cod')
    await db.query("update orders set payment_method='xpay' where id=$1", [f.order])
    await service.query('select cancel_xpay_order_without_payment($1)', [f.order])
    await adminChange(admin,f)
    assert.equal((await state(f)).stock_quantity,10)
  })
  await test('provider revival with insufficient stock rolls back all changes', async () => {
    const f = await fixture()
    await expire(service,f)
    await db.query('update products set stock_quantity=1 where id=$1', [f.product])
    await assert.rejects(paid(service,f), /PAYMENT_STOCK_UNAVAILABLE/)
    const row = await state(f)
    assert.equal(row.status,'cancelled')
    assert.equal(row.payment_status,'expired')
    assert.equal(row.attempt_status,'expired')
    assert.equal(row.stock_released,true)
    assert.equal(row.stock_quantity,1)
  })
  await test('confirmed/preparing cancellations and late-created payment attempts restore once', async () => {
    for (const method of ['cod','xpay']) {
      for (const stage of ['confirmed','preparing']) {
        const f = await fixture(method)
        if (method === 'xpay') await paid(service,f)
        else await adminChange(admin,f,'confirmed')
        if (stage === 'preparing') await adminChange(admin,f,stage)
        await adminChange(admin,f)
        await adminChange(admin,f)
        assert.equal((await state(f)).stock_quantity,10)
        if (method === 'xpay') assert.equal((await state(f)).payment_status,'successful')
      }
    }
    const f = await fixture('cod')
    await db.query("update orders set payment_method='xpay' where id=$1",[f.order])
    await adminChange(admin,f)
    f.payment = randomUUID()
    await service.query('insert into payments(id,order_id,amount) values($1,$2,200)',[f.payment,f.order])
    await expire(service,f)
    await paid(service,f)
    assert.equal((await state(f)).stock_quantity,10)
    assert.equal((await state(f)).status,'cancelled')
    assert.equal((await state(f)).payment_status,'successful')
  })
  await test('multiple attempts and deleted catalog entries cannot double restore', async () => {
    const f = await fixture()
    const second = { ...f, payment: randomUUID() }
    await db.query('insert into payments(id,order_id,amount) values($1,$2,200)', [second.payment,f.order])
    await race(service,service2,c => expire(c,f),c => expire(c,second))
    await adminChange(admin,f)
    assert.equal((await state(f)).stock_quantity,10)
    const deleted = await fixture('cod')
    await db.query('delete from products where id=$1', [deleted.product])
    await adminChange(admin,deleted)
    await adminChange(admin,deleted)
    const items = await db.query('select product_name,quantity from order_items where order_id=$1', [deleted.order])
    assert.equal(items.rows[0].quantity,2)
  })
  await test('refund synchronization is atomic and a late partial event cannot undo full refund', async () => {
    const f = await fixture()
    await paid(service,f)
    await service.query("select sync_xpay_payment_status($1,'refunded')", [f.payment])
    await service.query("select sync_xpay_payment_status($1,'partially_refunded')", [f.payment])
    await poll(service,f)
    await assert.rejects(adminChange(admin,f,'preparing'), /XPAY_PAYMENT_REQUIRED/)
    assert.equal((await state(f)).payment_status,'refunded')
    assert.equal((await state(f)).attempt_status,'refunded')
    await adminChange(admin,f)
    assert.equal((await state(f)).stock_quantity,10)
  })
  await test('UI uses payment-aware transitions and keeps historical COD defaults', async () => {
    assert.deepEqual(getAllowedStatusTransitions('pending'), ['confirmed','cancelled'])
    assert.deepEqual(getAllowedStatusTransitions('pending','cod','pending'), ['confirmed','cancelled'])
    assert.deepEqual(getAllowedStatusTransitions('pending','xpay','pending'), ['cancelled'])
    assert.deepEqual(getAllowedStatusTransitions('preparing','xpay','successful'), ['shipped','cancelled'])
    assert.deepEqual(getAllowedStatusTransitions('confirmed','xpay'), ['cancelled'])
    assert.deepEqual(getAllowedStatusTransitions('cancelled','xpay','successful'), [])
  })
  await testStorefront(test)
  const handlers = await loadHandlers(service)
  async function sessionFixture() {
    const f = await fixture()
    const session = { id: `cs_test_${randomUUID()}`, amountTotal: 20000, currency: 'EGP',
      paymentIntentId: `pi_test_${randomUUID()}`, livemode: false, status: 'complete', paymentStatus: 'paid' }
    await db.query("update payments set provider_session_id=$1,metadata='{\"mode\":\"test\"}' where id=$2", [session.id,f.payment])
    return { f, session }
  }
  const eventFor = (session, type = 'checkout.session.completed') => ({ id: randomUUID(), type, data: { object: session } })
  try {
    await test('worker rejects browser credentials and signed intake rejects invalid signatures before storage', async () => {
      const {session} = await sessionFixture()
      const event = eventFor(session)
      assert.equal((await handlers.worker(false)).status,401)
      assert.equal((await handlers.webhook(event,false)).status,400)
      assert.equal((await db.query('select count(*) from xpay_webhook_inbox where event_id=$1',[event.id])).rows[0].count,'0')
      await assert.rejects(customer.query('select claim_xpay_webhook_event(null)'), /permission denied/)
      await assert.rejects(anonymous.query('select * from xpay_webhook_inbox'), /permission denied/)
    })
    await test('failed durable enqueue returns non-2xx and provider retry subsequently succeeds', async () => {
      const {session} = await sessionFixture()
      const event = eventFor(session)
      await db.query(`create function test_fail_inbox() returns trigger language plpgsql as $$begin raise exception 'synthetic queue failure'; end$$;
        create trigger test_fail_inbox before insert on xpay_webhook_inbox for each row execute function test_fail_inbox()`)
      try { assert.equal((await handlers.webhook(event)).status,503) }
      finally { await db.query('drop trigger test_fail_inbox on xpay_webhook_inbox; drop function test_fail_inbox()') }
      assert.equal((await db.query('select count(*) from xpay_webhook_inbox where event_id=$1',[event.id])).rows[0].count,'0')
      assert.equal((await handlers.webhook(event)).status,200)
    })
    await test('worker drains maintenance backlog without new provider delivery and duplicates cannot change the payload', async () => {
      const {f,session} = await sessionFixture()
      const event = eventFor(session)
      await service.query('select set_checkout_maintenance(true)')
      assert.equal((await handlers.webhook(event)).status,503)
      assert.equal((await handlers.create()).status,503)
      assert.equal((await handlers.status({},session)).status,503)
      const paused=await (await handlers.worker()).json()
      assert.equal(paused.processed,0); assert.equal(paused.failed,0); assert.equal(paused.queue.maintenance,true)
      await assert.rejects(paid(service,f),/CHECKOUT_MAINTENANCE/)
      await assert.rejects(adminChange(admin,f),/CHECKOUT_MAINTENANCE/)
      await assert.rejects(service.query("update payments set provider_status='open' where id=$1",[f.payment]),/CHECKOUT_MAINTENANCE/)
      // Drain verified payments before admitting new checkout traffic.
      await service.query('select resume_xpay_webhook_processing()')
      assert.equal((await handlers.worker()).status,200)
      assert.equal((await state(f)).payment_status,'successful')
      assert.equal((await service.query('select checkout_maintenance_active() as active')).rows[0].active,true)
      await assert.rejects(fixture('cod'),/CHECKOUT_MAINTENANCE/)
      await service.query('select set_checkout_maintenance(false)')
      assert.equal((await handlers.webhook(event)).status,200)
      assert.equal((await handlers.webhook({...event,data:{object:{...session,status:'expired'}}})).status,503)
      assert.equal((await state(f)).stock_quantity,8)
    })
    await test('worker failure remains pending and recovery completes after dependency becomes available', async () => {
      const {f,session} = await sessionFixture()
      const event = eventFor(session)
      await db.query('update payments set provider_session_id=null where id=$1',[f.payment])
      assert.equal((await handlers.webhook(event)).status,503)
      let row=(await db.query('select state,lease_token,attempts from xpay_webhook_inbox where event_id=$1',[event.id])).rows[0]
      assert.equal(row.state,'received'); assert.equal(row.lease_token,null)
      await db.query('update payments set provider_session_id=$1 where id=$2',[session.id,f.payment])
      await db.query("update xpay_webhook_inbox set retry_at=now()-interval '1 second' where event_id=$1",[event.id])
      assert.equal((await handlers.worker()).status,200)
      row=(await db.query('select state,attempts from xpay_webhook_inbox where event_id=$1',[event.id])).rows[0]
      assert.equal(row.state,'processed'); assert.equal(row.attempts,2)
      assert.equal((await state(f)).stock_quantity,8)
    })
    await test('post-financial acknowledgement failure is safely retried without duplicate stock changes', async () => {
      const {f,session} = await sessionFixture()
      const event=eventFor(session)
      await db.query(`create function test_fail_ack() returns trigger language plpgsql as $$begin
        if new.state='processed' then raise exception 'synthetic ack failure'; end if; return new; end$$;
        create trigger test_fail_ack before update on xpay_webhook_inbox for each row execute function test_fail_ack()`)
      try { assert.equal((await handlers.webhook(event)).status,503) }
      finally { await db.query('drop trigger test_fail_ack on xpay_webhook_inbox; drop function test_fail_ack()') }
      assert.equal((await state(f)).payment_status,'successful')
      await db.query("update xpay_webhook_inbox set lease_until=now()-interval '1 second' where event_id=$1",[event.id])
      assert.equal((await handlers.worker()).status,200)
      assert.equal((await state(f)).stock_quantity,8)
    })
    await test('claims serialize, expire, reject stale acknowledgements, and preserve eligible receipt order', async () => {
      const a=eventFor((await sessionFixture()).session), b=eventFor((await sessionFixture()).session)
      for(const e of [a,b]) await service.query('select queue_xpay_webhook_event($1,$2,$3,$4)',[e.id,e.type,'test',e])
      const first=(await service.query('select claim_xpay_webhook_event(null) as claim')).rows[0].claim
      assert.equal(first.event_id,a.id)
      assert.equal((await service2.query('select claim_xpay_webhook_event(null) as claim')).rows[0].claim,null)
      await db.query("update xpay_webhook_inbox set lease_until=now()-interval '1 second' where event_id=$1",[a.id])
      const next=(await service2.query('select claim_xpay_webhook_event(null) as claim')).rows[0].claim
      assert.equal(next.event_id,a.id); assert.notEqual(next.lease_token,first.lease_token)
      await assert.rejects(service.query('select mark_xpay_webhook_event_processed($1,$2)',[a.id,first.lease_token]),/LEASE_LOST/)
      await service2.query('select retry_xpay_webhook_event($1,$2,$3)',[a.id,next.lease_token,'retry'])
      assert.equal((await handlers.worker()).status,200)
      await db.query("update xpay_webhook_inbox set retry_at=now()-interval '1 second' where event_id=$1",[a.id])
      assert.equal((await handlers.worker()).status,200)
    })
    await test('signed webhook is durably queued during maintenance, retried, then acknowledged after processing', async () => {
      const { session } = await sessionFixture()
      const event = eventFor(session)
      await service.query('select set_checkout_maintenance(true)')
      assert.equal((await handlers.webhook(event)).status,503)
      assert.equal((await db.query('select state from xpay_webhook_inbox where event_id=$1',[event.id])).rows[0].state,'received')
      await service.query('select set_checkout_maintenance(false)')
      assert.equal((await handlers.webhook(event)).status,200)
      assert.equal((await db.query('select state from xpay_webhook_inbox where event_id=$1',[event.id])).rows[0].state,'processed')
    })
    await test('real signed webhook, event retry and admin cancellation remain compatible', async () => {
      const { f, session } = await sessionFixture()
      await adminChange(admin,f)
      const event = eventFor(session)
      assert.equal((await handlers.webhook(event)).status,200)
      assert.equal((await handlers.webhook(event)).status,200)
      assert.equal((await state(f)).payment_status,'successful')
      assert.equal((await state(f)).status,'cancelled')
      assert.equal((await state(f)).stock_quantity,10)
    })
    await test('real payment polling and refund handlers use the restricted atomic RPCs', async () => {
      const { f, session } = await sessionFixture()
      const { guest_token: guestToken } = (await db.query('select guest_token from payments where id=$1',[f.payment])).rows[0]
      const body = { paymentId: f.payment, guestToken }
      assert.equal((await handlers.status(body,{...session,paymentStatus:'unpaid'})).status,200)
      assert.equal((await state(f)).payment_status,'requires_action')
      assert.equal((await handlers.status(body,session)).status,200)
      assert.equal((await state(f)).payment_status,'successful')
      const refund = { id: `re_test_${randomUUID()}`, object: 'refund', amount: 20000,
        chargeId: `ch_test_${randomUUID()}`, paymentIntentId: session.paymentIntentId,
        currency: 'EGP', status: 'SUCCEEDED' }
      assert.equal((await handlers.webhook({ id: `evt_test_${randomUUID()}`, livemode: false,
        type: 'refund.created', data: { object: refund } })).status,200)
      assert.equal((await state(f)).payment_status,'refunded')
      assert.equal((await state(f)).attempt_status,'refunded')
    })
    await test('real handlers preserve signature, mode, amount, ownership and guest-token verification', async () => {
      const { f, session } = await sessionFixture()
      assert.equal((await handlers.webhook(eventFor(session),false)).status,400)
      assert.equal((await handlers.webhook(eventFor({...session,livemode:true}))).status,400)
      assert.equal((await handlers.webhook(eventFor({...session,amountTotal:1}))).status,500)
      assert.equal((await handlers.webhook(eventFor({...session,metadata:{athar_order_id:randomUUID()}}))).status,500)
      assert.equal((await handlers.status({paymentId:f.payment,guestToken:randomUUID()},session)).status,404)
      assert.equal((await state(f)).payment_status,'pending')
      assert.equal((await state(f)).stock_quantity,8)
    })
    await testRefunds({ test, db, service, service2, admin, customer, anonymous,
      handlers, sessionFixture, state, paid, adminChange, race, eventFor })
  } finally {
    handlers.close()
  }
  await testEncryptedBackup({test,db,server,directory,port})
  console.log(`\n${passed} regression groups passed on disposable PostgreSQL.`)
} finally {
  await Promise.allSettled(clients.map(client => client.end()))
  await server.stop()
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
