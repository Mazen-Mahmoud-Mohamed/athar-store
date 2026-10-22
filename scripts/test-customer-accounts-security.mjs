// Migration 015 & Customer Accounts Security Validation Suite
// Runs on a fresh loopback-only PostgreSQL 17.11 cluster with migrations 001-015.
// Does NOT touch Supabase production.

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import EmbeddedPostgres from 'embedded-postgres'

console.log('--- Starting Migration 015 & Customer Accounts Validation Suite ---')

const portProbe = net.createServer()
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
const port = portProbe.address().port
await new Promise(resolve => portProbe.close(resolve))

const directory = await mkdtemp(path.join(tmpdir(), 'athar-migration-015-test-'))
// Validate the exact recursive cleanup target before starting the cluster.
assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
assert.ok(path.basename(directory).startsWith('athar-migration-015-test-'))
console.log(`Initialized temp directory: ${directory} on port: ${port}`)

const server = new EmbeddedPostgres({
  databaseDir: directory, port, user: 'postgres', password: randomUUID(),
  persistent: true, initdbFlags: ['--encoding=UTF8'], postgresFlags: ['-h', '127.0.0.1'],
  onLog() {}, onError(message) { console.error('PG Error:', message) },
})

let db
const clients = []

async function connect(role, uid) {
  const client = server.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  clients.push(client)
  await client.query("set statement_timeout = '8s'")
  if (role) await client.query(`set role ${role}`)
  if (uid) await client.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
  return client
}

async function runMigrationFile(filename) {
  const sql = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
  await db.query(sql)
}

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`[PASS] ${name}`)
  } catch (err) {
    failed++
    console.error(`[FAIL] ${name}`)
    console.error(err)
    throw err
  }
}

try {
  await server.initialise()
  await server.start()
  db = await connect()

  // 1. Setup mock auth schema & users table as Supabase creates
  await db.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now()
    );
    create or replace function auth.uid() returns uuid as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ language sql stable;
    create or replace function auth.role() returns text as $$
      select nullif(current_setting('request.jwt.claim.role', true), '')::text;
    $$ language sql stable;

    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text,
      public boolean default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      last_accessed_at timestamptz default now(),
      metadata jsonb default '{}'::jsonb
    );
    alter table storage.objects enable row level security;

    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    grant anon, authenticated, service_role to postgres;
    grant usage on schema auth to anon, authenticated, service_role, public;
    grant select on auth.users to anon, authenticated, service_role, public;

    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      statements text[]
    );
  `)

  // 2. Run migrations 001 through 014
  console.log('Applying baseline migrations 001 - 014...')
  const migrations001_014 = [
    '20261003000001_initial_schema.sql',
    '20261003000002_rls.sql',
    '20261003000003_storage.sql',
    '20261003000004_guest_order_confirmation.sql',
    '20261003000005_admin_order_status_workflow.sql',
    '20261003000006_deactivate_empty_totes_category.sql',
    '20261003000007_deactivate_empty_active_categories.sql',
    '20261004000008_xpay_payments.sql',
    '20261004000009_xpay_service_role_rpc_grants.sql',
    '20261004000010_xpay_service_role_table_grants.sql',
    '20261004000011_xpay_service_role_order_read_grants.sql',
    '20261020000012_order_inventory_and_payment_guards.sql',
    '20261021000013_xpay_refund_event_ledger.sql',
    '20261021000014_checkout_maintenance_and_webhook_inbox.sql',
  ]

  for (const m of migrations001_014) {
    await runMigrationFile(m)
  }
  console.log('Baseline migrations applied successfully.')

  // Create mock users in auth.users & profiles
  const customer1Id = randomUUID()
  const customer2Id = randomUUID()
  const unconfirmedCustId = randomUUID()
  const adminId = randomUUID()

  await db.query(`
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ($1, 'cust1@example.com', now(), '{"full_name":"Customer One"}'::jsonb),
      ($2, 'cust2@example.com', now(), '{"full_name":"Customer Two"}'::jsonb),
      ($3, 'unconfirmed@example.com', null, '{"full_name":"Unconfirmed Customer"}'::jsonb),
      ($4, 'admin@example.com', now(), '{"full_name":"Store Admin"}'::jsonb);
  `, [customer1Id, customer2Id, unconfirmedCustId, adminId])

  // Set the admin user's role to 'admin' using the exact same technique as test-order-workflow.mjs:
  await db.query('delete from public.profiles where id = $1', [adminId])
  await db.query("insert into public.profiles (id, full_name, role) values ($1, 'Store Admin', 'admin')", [adminId])

  // Create a product for orders
  const productId = randomUUID()
  await db.query(`
    insert into public.products (id, name, slug, price, stock_quantity, is_active)
    values ($1, 'Test Product', 'test-product', 100.00, 20, true);
  `, [productId])

  // Create a historical guest order (before migration 015)
  const historicalGuestOrderId = randomUUID()
  await db.query(`
    insert into public.orders (id, customer_name, phone, address, status, subtotal, total, payment_method, payment_status)
    values ($1, 'Old Guest', '01011112222', 'Old Street 1', 'pending', 100.00, 100.00, 'cod', 'pending');
  `, [historicalGuestOrderId])

  await db.query(`
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values ($1, $2, 'Test Product', 100.00, 1, 100.00);
  `, [historicalGuestOrderId, productId])

  // TEST 1: Run migration 015 against PostgreSQL 17.11
  await test('1. Run migration 015 cleanly on PostgreSQL 17.11', async () => {
    await runMigrationFile('20261022000015_customer_accounts.sql')
    // Verify columns exist
    const { rows: colRows } = await db.query(`
      select column_name from information_schema.columns
      where table_schema='public' and table_name='orders' and column_name in ('customer_id', 'cancellation_requested_at')
    `)
    assert.equal(colRows.length, 2, 'orders columns customer_id and cancellation_requested_at must exist')

    // Historical guest order should still have customer_id IS NULL
    const { rows: histRows } = await db.query(`select customer_id from public.orders where id = $1`, [historicalGuestOrderId])
    assert.equal(histRows[0].customer_id, null, 'historical guest orders must retain NULL customer_id')
  })

  // TEST 2: Verify create_guest_order is completely dropped
  await test('2. Legacy create_guest_order overloads are completely removed', async () => {
    const { rows } = await db.query(`
      select p.proname, p.oid::regprocedure as sig from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_guest_order';
    `)
    assert.equal(rows.length, 0, 'No create_guest_order overloads should exist')
  })

  // TEST 3: Anonymous caller cannot create order via create_customer_order
  await test('3. Anonymous callers cannot create orders (RPC rejects anon)', async () => {
    const anonClient = await connect('anon', null)
    await assert.rejects(
      async () => {
        await anonClient.query(`
          select public.create_customer_order(
            'Anon Guy', '01099998888', 'Anon Address 123', null,
            $1::jsonb, 'cod'
          )
        `, [JSON.stringify([{ product_id: productId, quantity: 1 }])])
      },
      (err) => {
        return /permission denied|AUTHENTICATION_REQUIRED/i.test(err.message)
      },
      'Anonymous caller must be rejected from creating customer orders'
    )
  })

  // TEST 4: Direct table insert by anonymous/authenticated is blocked by trigger & RLS
  await test('4. Direct table insert bypassing RPC is blocked for anonymous & authenticated', async () => {
    const anonClient = await connect('anon', null)
    await assert.rejects(
      async () => {
        await anonClient.query(`
          insert into public.orders (customer_name, phone, address, subtotal, total)
          values ('Hacker', '01000000000', 'Dark Alley', 100, 100);
        `)
      },
      /permission denied|AUTHENTICATION_REQUIRED/i
    )

    const custClient = await connect('authenticated', customer1Id)
    // Even authenticated direct insert should be blocked or enforced
    await assert.rejects(
      async () => {
        // trying to insert someone else's customer_id
        await custClient.query(`
          insert into public.orders (customer_id, customer_name, phone, address, subtotal, total)
          values ($1, 'Impostor', '01000000000', 'Dark Alley', 100, 100);
        `, [customer2Id])
      },
      /AUTHENTICATION_REQUIRED|permission denied/i
    )
  })

  // TEST 5: Unconfirmed customer cannot create order
  await test('5. Customer with unconfirmed email cannot create order', async () => {
    const unconfirmedClient = await connect('authenticated', unconfirmedCustId)
    await assert.rejects(
      async () => {
        await unconfirmedClient.query(`
          select public.create_customer_order(
            'Unconfirmed', '01055554444', 'Unconfirmed Street', null,
            $1::jsonb, 'cod'
          )
        `, [JSON.stringify([{ product_id: productId, quantity: 1 }])])
      },
      /EMAIL_VERIFICATION_REQUIRED/i,
      'Unconfirmed email must be rejected'
    )
  })

  // TEST 6: Authenticated confirmed customer creates COD order successfully with ownership enforced
  let cust1OrderId
  await test('6. Authenticated customer creates COD order; customer_id is server-enforced', async () => {
    const cust1Client = await connect('authenticated', customer1Id)
    const { rows } = await cust1Client.query(`
      select public.create_customer_order(
        'Customer One', '01012345678', 'Customer 1 Address', 'Leave at door',
        $1::jsonb, 'cod'
      ) as res;
    `, [JSON.stringify([{ product_id: productId, quantity: 2 }])])

    const res = rows[0].res
    cust1OrderId = res.id
    assert.ok(cust1OrderId, 'Order ID must be returned')
    assert.equal(res.status, 'pending')
    assert.equal(res.total, 200.00)

    // Check DB directly
    const { rows: orderRows } = await db.query(`select * from public.orders where id = $1`, [cust1OrderId])
    assert.equal(orderRows[0].customer_id, customer1Id, 'customer_id must match auth.uid()')
    assert.equal(orderRows[0].payment_method, 'cod')

    // Stock should be decremented: initial 20 - 2 = 18
    const { rows: prodRows } = await db.query(`select stock_quantity from public.products where id = $1`, [productId])
    assert.equal(prodRows[0].stock_quantity, 18, 'Stock must be decremented by 2')
  })

  // TEST 7: Customer 2 creates XPay order
  let cust2OrderId
  let cust2PaymentId
  await test('7. Authenticated customer creates XPay order', async () => {
    const cust2Client = await connect('authenticated', customer2Id)
    const { rows } = await cust2Client.query(`
      select public.create_customer_order(
        'Customer Two', '01087654321', 'Customer 2 Address', null,
        $1::jsonb, 'xpay'
      ) as res;
    `, [JSON.stringify([{ product_id: productId, quantity: 1 }])])

    cust2OrderId = rows[0].res.id
    assert.ok(cust2OrderId)

    // Insert payment row
    cust2PaymentId = randomUUID()
    await db.query(`
      insert into public.payments (id, order_id, amount, currency, status)
      values ($1, $2, 100.00, 'EGP', 'pending');
    `, [cust2PaymentId, cust2OrderId])

    // Stock decremented: 18 - 1 = 17
    const { rows: prodRows } = await db.query(`select stock_quantity from public.products where id = $1`, [productId])
    assert.equal(prodRows[0].stock_quantity, 17)
  })

  // TEST 8: RLS order isolation (Customer 1 vs Customer 2 vs Anon vs Admin)
  await test('8. RLS order isolation between Customer 1, Customer 2, Anon, and Admin', async () => {
    const anonClient = await connect('anon', null)
    const cust1Client = await connect('authenticated', customer1Id)
    const cust2Client = await connect('authenticated', customer2Id)
    const adminClient = await connect('authenticated', adminId)

    // Anon: denied select on orders table (cannot read any orders)
    await assert.rejects(
      async () => {
        await anonClient.query('select * from public.orders')
      },
      /permission denied/i,
      'Anonymous caller has no select grant on orders'
    )

    // Cust 1: sees only their own order (cust1OrderId), cannot see cust2OrderId or historical guest order
    const { rows: c1Orders } = await cust1Client.query('select * from public.orders')
    assert.equal(c1Orders.length, 1, 'Customer 1 must see exactly 1 order')
    assert.equal(c1Orders[0].id, cust1OrderId, 'Customer 1 must see only their own order')

    // Cust 1 tries to query cust2OrderId directly
    const { rows: c1Specific } = await cust1Client.query('select * from public.orders where id = $1', [cust2OrderId])
    assert.equal(c1Specific.length, 0, 'Customer 1 direct query for Customer 2 order returns 0 rows')

    // Cust 2: sees only cust2OrderId
    const { rows: c2Orders } = await cust2Client.query('select * from public.orders')
    assert.equal(c2Orders.length, 1)
    assert.equal(c2Orders[0].id, cust2OrderId)

    // Order items isolation: Cust 1 querying order_items for Cust 2's order
    const { rows: c1Items } = await cust1Client.query('select * from public.order_items where order_id = $1', [cust2OrderId])
    assert.equal(c1Items.length, 0, 'Customer 1 cannot see order_items of Customer 2')

    // Admin: sees ALL orders (cust1, cust2, historical guest)
    const { rows: adminOrders } = await adminClient.query('select * from public.orders')
    assert.equal(adminOrders.length, 3, 'Admin must see all 3 orders')
  })

  // TEST 9: Profile RLS - Customers cannot elevate role or edit other profiles
  await test('9. Profile RLS: customer cannot elevate role or edit another profile', async () => {
    const cust1Client = await connect('authenticated', customer1Id)

    // Attempt to escalate role to admin
    await cust1Client.query(`
      update public.profiles set role = 'admin' where id = $1;
    `, [customer1Id]).catch(() => {})

    // Verify role is still 'customer'
    const { rows: checkRole } = await db.query(`select role from public.profiles where id = $1`, [customer1Id])
    assert.equal(checkRole[0].role, 'customer', 'Role column update by customer must be revoked or ignored')

    // Attempt to update customer 2's profile
    const { rowCount } = await cust1Client.query(`
      update public.profiles set full_name = 'Hacked Name' where id = $1;
    `, [customer2Id])
    assert.equal(rowCount, 0, 'Customer 1 cannot update Customer 2 profile')
  })

  // TEST 10: COD order cancellation by customer with inventory restoration
  await test('10. COD customer cancellation restores stock exactly once & idempotent', async () => {
    const cust1Client = await connect('authenticated', customer1Id)

    // Stock before cancel: 17
    const { rows: pBefore } = await db.query(`select stock_quantity from public.products where id = $1`, [productId])
    assert.equal(pBefore[0].stock_quantity, 17)

    // Cancel order
    const { rows: cancelRes } = await cust1Client.query(`
      select * from public.customer_cancel_order($1::uuid);
    `, [cust1OrderId])
    assert.equal(cancelRes[0].status, 'cancelled')
    assert.equal(cancelRes[0].cancellation_source, 'customer')

    // Stock restored: 17 + 2 = 19
    const { rows: pAfter } = await db.query(`select stock_quantity from public.products where id = $1`, [productId])
    assert.equal(pAfter[0].stock_quantity, 19, 'Stock must be restored by 2')

    // Duplicate cancellation request (idempotent): stock must NOT be restored again
    const { rows: cancelDup } = await cust1Client.query(`
      select * from public.customer_cancel_order($1::uuid);
    `, [cust1OrderId])
    assert.equal(cancelDup[0].status, 'cancelled')

    const { rows: pDup } = await db.query(`select stock_quantity from public.products where id = $1`, [productId])
    assert.equal(pDup[0].stock_quantity, 19, 'Duplicate cancel must not restore stock twice')
  })

  // TEST 11: Cross-customer cancellation is rejected
  await test('11. Customer cannot cancel another customer order', async () => {
    const cust1Client = await connect('authenticated', customer1Id)
    await assert.rejects(
      async () => {
        await cust1Client.query(`select public.customer_cancel_order($1::uuid)`, [cust2OrderId])
      },
      /ORDER_NOT_FOUND/i,
      'Cancelling an order belonging to another customer must raise ORDER_NOT_FOUND'
    )
  })

  // TEST 12: XPay customer cancellation requests cancellation flag (does not auto-refund or restock)
  await test('12. XPay cancellation sets cancellation_requested_at without auto-restock', async () => {
    const cust2Client = await connect('authenticated', customer2Id)

    const { rows: cancelRes } = await cust2Client.query(`
      select * from public.customer_cancel_order($1::uuid);
    `, [cust2OrderId])

    assert.ok(cancelRes[0].cancellation_requested_at, 'cancellation_requested_at must be populated')
    assert.equal(cancelRes[0].status, 'pending', 'Status stays pending for merchant review')

    // Stock should NOT be released automatically
    const { rows: pRows } = await db.query(`select stock_quantity from public.products where id = $1`, [productId])
    assert.equal(pRows[0].stock_quantity, 19, 'Stock must NOT be restored on XPay cancel request')

    // Admin cannot advance an order that has cancellation_requested_at without review
    const adminClient = await connect('authenticated', adminId)
    await assert.rejects(
      async () => {
        await adminClient.query(`select * from public.admin_update_order_status($1, 'confirmed')`, [cust2OrderId])
      },
      /CANCELLATION_REVIEW_REQUIRED/i,
      'Admin cannot advance order with pending cancellation request'
    )
  })

  // TEST 13: XPay payment success on customer order keeps status 'pending' (merchant fulfillment confirmation separation)
  await test('13. XPay payment success on customer order leaves status "pending" (not auto "confirmed")', async () => {
    // Create new XPay order for Cust 1 without cancellation request
    const cust1Client = await connect('authenticated', customer1Id)
    const { rows: newOrderRows } = await cust1Client.query(`
      select public.create_customer_order(
        'Customer One', '01011113333', 'Street 99', null,
        $1::jsonb, 'xpay'
      ) as res;
    `, [JSON.stringify([{ product_id: productId, quantity: 1 }])])

    const order3Id = newOrderRows[0].res.id
    const payment3Id = randomUUID()
    await db.query(`
      insert into public.payments (id, order_id, amount, currency, status)
      values ($1, $2, 100.00, 'EGP', 'pending');
    `, [payment3Id, order3Id])

    // Simulate mark_xpay_order_paid (webhook processing)
    const { rows: paidRes } = await db.query(`
      select public.mark_xpay_order_paid($1, 'sess_123', 'pi_123', 'PAID', 'SUCCESS') as res;
    `, [payment3Id])

    assert.equal(paidRes[0].res.payment_status, 'successful')
    assert.equal(paidRes[0].res.order_status, 'pending', 'Customer order must stay "pending" for merchant fulfillment confirmation!')

    // Check order row in DB
    const { rows: o3Rows } = await db.query(`select status, payment_status from public.orders where id = $1`, [order3Id])
    assert.equal(o3Rows[0].payment_status, 'successful')
    assert.equal(o3Rows[0].status, 'pending', 'Status remains pending')

    // Now admin can confirm it because payment is successful and no cancellation requested
    const adminClient = await connect('authenticated', adminId)
    const { rows: adminConf } = await adminClient.query(`
      select * from public.admin_update_order_status($1, 'confirmed');
    `, [order3Id])
    assert.equal(adminConf[0].status, 'confirmed')
  })

  // TEST 14: Historical guest orders with NULL customer_id still auto-confirm on XPay payment
  await test('14. Historical guest order (customer_id is NULL) preserves backward compatibility on XPay paid', async () => {
    // Create payment for historicalGuestOrderId
    const histPaymentId = randomUUID()
    // Update the historical guest order to use xpay payment method
    await db.query(`
      update public.orders set payment_method = 'xpay' where id = $1;
    `, [historicalGuestOrderId])
    await db.query(`
      insert into public.payments (id, order_id, amount, currency, status)
      values ($1, $2, 100.00, 'EGP', 'pending');
    `, [histPaymentId, historicalGuestOrderId])

    const { rows: histPaidRes } = await db.query(`
      select public.mark_xpay_order_paid($1, 'sess_hist', 'pi_hist', 'PAID', 'SUCCESS') as res;
    `, [histPaymentId])

    assert.equal(histPaidRes[0].res.payment_status, 'successful')
    assert.equal(histPaidRes[0].res.order_status, 'confirmed', 'Historical guest order transitions to confirmed upon payment')
  })

  console.log(`\n========================================`)
  console.log(`ALL TESTS PASSED: ${passed}/${passed} passed, ${failed} failed`)
  console.log(`========================================\n`)

} finally {
  for (const c of clients) {
    try { await c.end() } catch {}
  }
  try { await server.stop() } catch {}
  try {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('athar-migration-015-test-'))
    await rm(directory, { recursive: true, force: true })
  } catch {}
}
