// Synthetic provider-shaped fixtures; no provider API calls.
// Contract: docs.xpay.app/en/api-reference/objects/{refund,charge}
// Event guide also documents charge.refunds.data; both shapes are covered.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { parseRefundEvent } from '../supabase/functions/_shared/xpay.ts'

const id = prefix => `${prefix}_test_${randomUUID()}`
const event = (object, type = 'refund.created') => ({ id: id('evt'), object: 'event',
  api_version: '3.1.0', created: '2026-05-01T12:00:00.000Z', livemode: false,
  type, data: { object } })
const refund = (session, amount = 20000, status = 'SUCCEEDED', chargeId = id('ch')) => ({
  id: id('re'), object: 'refund', amount, currency: 'EGP', status, chargeId,
  paymentIntentId: session.paymentIntentId, balanceTransactionId: null,
  failureBalanceTransactionId: null, externalRefundId: null,
  createdAt: '2026-05-01T12:00:00.000Z', reason: 'REQUESTED_BY_CUSTOMER',
})
const charge = (session, refunds) => ({ id: refunds[0].chargeId, object: 'charge',
  amount: 20000, amountCaptured: 20000,
  amountRefunded: refunds.filter(r => r.status.toLowerCase() === 'succeeded').reduce((s,r) => s+r.amount,0),
  currency: 'EGP', status: 'SUCCEEDED', paid: true, captured: true, refunded: false,
  createdAt: '2026-05-01T12:00:00.000Z', paymentIntentId: session.paymentIntentId, refunds,
})

export async function testRefunds(c) {
  const {test, db, service, service2, admin, customer, anonymous, handlers,
    sessionFixture, state, adminChange, race, eventFor} = c
  const send = e => handlers.webhook(e)
  const seen = async e => (await db.query('select * from xpay_webhook_events where event_id=$1',[e.id])).rows[0]
  const ledger = async f => (await db.query('select * from xpay_refunds where payment_id=$1 order by provider_refund_id',[f.payment])).rows
  async function ready() {
    const item = await sessionFixture()
    assert.equal((await send(eventFor(item.session))).status,200)
    return item
  }
  function args(f,e) {
    return [f.payment,e.id,e.type,'test',JSON.stringify(parseRefundEvent('test',e).refunds)]
  }
  const apply = (client,f,e) => client.query('select apply_xpay_refund_event($1,$2,$3,$4,$5::jsonb)',args(f,e))

  await test('refund ledger and RPC are service-only; direct ledger writes are denied', async () => {
    const { f,session } = await ready()
    const e = event(refund(session))
    for (const client of [customer,anonymous]) {
      await assert.rejects(apply(client,f,e),/permission denied/)
      await assert.rejects(client.query('select * from xpay_refunds'),/permission denied/)
    }
    await assert.rejects(service.query("update xpay_refunds set status='succeeded'"),/permission denied/)
    assert.equal((await seen(e)),undefined)
  })
  await test('provider RefundAPI full success updates both money states and never restores stock', async () => {
    const { f,session } = await ready()
    const before = await state(f)
    const e = event(refund(session))
    assert.equal((await send(e)).status,200)
    const after = await state(f)
    assert.equal(after.payment_status,'refunded')
    assert.equal(after.attempt_status,'refunded')
    assert.equal(after.stock_quantity,before.stock_quantity)
    assert.equal(after.stock_released,before.stock_released)
    assert.equal(after.status,before.status)
    assert.equal((await seen(e)).refunds_applied,true)
    assert.equal((await ledger(f)).length,1)
    await assert.rejects(adminChange(admin,f,'preparing'),/XPAY_PAYMENT_REQUIRED/)
  })
  await test('worker recovers queued successful, failed and partial refunds while checkout stays closed', async () => {
    const {f,session}=await ready()
    const a=event(refund(session,4000)), b=event(refund(session,2000,'FAILED'),'refund.failed')
    await service.query('select set_checkout_maintenance(true)')
    for(const e of [a,b]) assert.equal((await send(e)).status,503)
    await service.query('select resume_xpay_webhook_processing()')
    await handlers.worker()
    assert.equal((await state(f)).payment_status,'partially_refunded')
    assert.equal((await state(f)).stock_quantity,8)
    assert.deepEqual((await ledger(f)).map(r=>r.status).sort(),['failed','succeeded'])
    for(const e of [a,b]) assert.equal((await db.query('select state from xpay_webhook_inbox where event_id=$1',[e.id])).rows[0].state,'processed')
    assert.equal((await send(a)).status,200)
    assert.equal((await ledger(f)).length,2)
    await service.query('select set_checkout_maintenance(false)')
  })
  await test('partial refunds accumulate by unique refund ID across deliveries and event types', async () => {
    const { f,session } = await ready()
    const a = refund(session,4000), b = refund(session,6000,'succeeded',a.chargeId)
    const first = event(a)
    for (const e of [first,first,event(a),event(charge(session,[a]),'charge.refunded')]) {
      assert.equal((await send(e)).status,200)
    }
    assert.equal((await state(f)).payment_status,'partially_refunded')
    assert.equal((await ledger(f)).length,1)
    assert.equal((await send(event(b))).status,200)
    assert.equal((await state(f)).payment_status,'partially_refunded')
    assert.equal((await ledger(f)).reduce((s,r)=>s+Number(r.amount_minor),0),10000)
    assert.equal((await send(event(refund(session,10000,'SUCCEEDED',a.chargeId)))).status,200)
    assert.equal((await state(f)).payment_status,'refunded')
    assert.equal((await state(f)).stock_quantity,8)
  })
  await test('pending, requires-action, failed and canceled refunds do not count as returned funds', async () => {
    const { f,session } = await ready()
    for (const status of ['PENDING','REQUIRES_ACTION','FAILED','CANCELED']) {
      const r = refund(session,2000,status)
      assert.equal((await send(event(r,status === 'FAILED'?'refund.failed':'refund.created'))).status,200)
    }
    assert.equal((await state(f)).payment_status,'successful')
    assert.deepEqual((await ledger(f)).map(r=>r.status).sort(),['canceled','failed','pending','requires_action'])
  })
  await test('out-of-order refund lifecycle cannot erase success or revive failed pending work', async () => {
    const {f,session} = await ready()
    const r = refund(session,5000,'pending')
    for (const status of ['pending','requires_action','failed','pending','succeeded','failed','pending']) {
      assert.equal((await send(event({...r,status},status==='failed'?'refund.failed':'refund.created'))).status,200)
      if (status==='failed' && (await ledger(f))[0].status!=='succeeded') assert.equal((await ledger(f))[0].status,'failed')
    }
    assert.equal((await ledger(f))[0].status,'succeeded')
    assert.equal((await state(f)).payment_status,'partially_refunded')
  })
  await test('ChargeAPI arrays and refunds.data snapshots merge safely in reverse order', async () => {
    const {f,session} = await ready()
    const a=refund(session,5000), b=refund(session,15000,'SUCCEEDED',a.chargeId)
    const snapshot=charge(session,[a,b])
    assert.equal((await send(event({...snapshot,refunds:{data:[a,b],has_more:false}},'charge.refunded'))).status,200)
    assert.equal((await send(event(charge(session,[a]),'charge.refunded'))).status,200)
    assert.equal((await send(event(a))).status,200)
    assert.equal((await state(f)).payment_status,'refunded')
    assert.equal((await ledger(f)).length,2)
  })
  await test('refund without known intent association fails without consuming event', async () => {
    const {session}=await ready()
    const e=event({...refund(session),paymentIntentId:id('pi')})
    assert.equal((await send(e)).status,500)
    assert.equal(await seen(e),undefined)
  })
  await test('refund before paid verification retries safely once checkout success arrives', async () => {
    const {f,session}=await sessionFixture()
    await db.query('update payments set provider_payment_intent_id=$1 where id=$2',[session.paymentIntentId,f.payment])
    const e=event(refund(session))
    assert.equal((await send(e)).status,500)
    assert.equal(await seen(e),undefined)
    assert.equal((await ledger(f)).length,0)
    assert.equal((await send(eventFor(session))).status,200)
    assert.equal((await send(e)).status,200)
    assert.equal((await state(f)).payment_status,'refunded')
  })
  await test('invalid signatures and mode evidence never mutate or acknowledge refund events', async () => {
    const {f,session}=await ready()
    const e=event(refund(session))
    assert.equal((await handlers.webhook(e,false)).status,400)
    for (const invalid of [{...e,livemode:true},{...e,livemode:undefined},
      {...e,id:'evt_live_wrong'},event({...e.data.object,paymentIntentId:'pi_live_wrong'})]) {
      assert.equal((await send(invalid)).status,400)
      assert.equal(await seen(invalid),undefined)
    }
    assert.equal((await ledger(f)).length,0)
  })
  await test('the same documented refund and charge contracts validate in live mode without provider calls', async () => {
    const {session}=await ready()
    const r=refund(session,4000)
    for(const e of [event(r),event(charge(session,[r]),'charge.refunded')]) {
      const live=JSON.parse(JSON.stringify(e).replaceAll('_test_','_live_'))
      live.livemode=true
      assert.equal(parseRefundEvent('live',live).refunds[0].amount_minor,4000)
      assert.throws(()=>parseRefundEvent('test',live),/XPAY_REFUND_INVALID/)
    }
  })
  await test('invalid refund objects, amounts, currencies, statuses and charge lists fail closed', async () => {
    const {f,session}=await ready()
    const r=refund(session,1000)
    const invalid=[event({...session}),event({...r,object:'checkout.session'}),
      ...[0,-1,1.5,'1000',NaN,Number.MAX_SAFE_INTEGER+1].map(amount=>event({...r,amount})),
      event({...r,currency:'USD'}),event({...r,status:'unknown'}),event({...r,chargeId:undefined}),
      event(r,'refund.failed'),event({...charge(session,[r]),amountRefunded:2000},'charge.refunded'),
      event({...charge(session,[r]),refunds:[]},'charge.refunded'),
      event({...charge(session,[r]),refunds:{data:[r],has_more:true}},'charge.refunded'),
      event({...charge(session,[r]),refunds:[r,r]},'charge.refunded'),
      event({...charge(session,[r]),amount:10000,amountCaptured:10000},'charge.refunded'),
      event({...charge(session,[r]),refunds:[{...r,chargeId:id('ch')}]},'charge.refunded')]
    for(const e of invalid) {
      assert.equal((await send(e)).status,400,JSON.stringify(e))
      assert.equal(await seen(e),undefined)
    }
    assert.equal((await ledger(f)).length,0)
    assert.equal((await state(f)).payment_status,'successful')
  })
  await test('immutable refund identity and cumulative over-refund roll back event and financial writes', async () => {
    const {f,session}=await ready()
    const r=refund(session,15000)
    assert.equal((await send(event(r))).status,200)
    for(const e of [event({...r,amount:16000}),event({...r,chargeId:id('ch')}),event(refund(session,6000))]) {
      assert.equal((await send(e)).status,500)
      assert.equal(await seen(e),undefined)
    }
    assert.equal((await ledger(f)).length,1)
    assert.equal((await ledger(f))[0].amount_minor,'15000')
    assert.equal((await state(f)).payment_status,'partially_refunded')
  })
  await test('database failure during final event insert rolls back ledger and both payment states', async () => {
    const {f,session}=await ready()
    const e=event(refund(session))
    await db.query(`create function public.test_reject_refund_event() returns trigger language plpgsql as $$
      begin if new.refunds_applied then raise exception 'synthetic insert failure'; end if; return new; end $$;
      create trigger test_reject_refund_event before insert on xpay_webhook_events
      for each row execute function public.test_reject_refund_event();`)
    try {
      assert.equal((await send(e)).status,500)
      assert.equal(await seen(e),undefined)
      assert.equal((await ledger(f)).length,0)
      assert.equal((await state(f)).payment_status,'successful')
      assert.equal((await state(f)).attempt_status,'successful')
    } finally {
      await db.query('drop trigger test_reject_refund_event on xpay_webhook_events; drop function public.test_reject_refund_event()')
    }
    assert.equal((await send(e)).status,200)
    assert.equal((await state(f)).payment_status,'refunded')
  })
  await test('concurrent distinct refund events serialize and sum exactly once under real blocked locks', async () => {
    const {f,session}=await ready()
    const a=event(refund(session,7000)),b=event(refund(session,13000))
    await race(service,service2,()=>apply(service,f,a),()=>apply(service2,f,b))
    assert.equal((await state(f)).payment_status,'refunded')
    assert.equal((await ledger(f)).length,2)
    assert.equal((await send(a)).status,200)
    assert.equal((await send(b)).status,200)
  })
  await test('concurrent same event or same refund from different event types never double counts', async () => {
    for(const sameEvent of [true,false]) {
      const {f,session}=await ready()
      const r=refund(session,10000),a=event(r),b=sameEvent?a:event(charge(session,[r]),'charge.refunded')
      await race(service,service2,()=>apply(service,f,a),()=>apply(service2,f,b))
      assert.equal((await ledger(f)).length,1)
      assert.equal((await state(f)).payment_status,'partially_refunded')
    }
  })
  await test('concurrent signed webhook requests on separate connections share atomic refund dedupe', async () => {
    for(const duplicate of [true,false]) {
      const {f,session}=await ready()
      const r=refund(session,8000),a=event(r),b=duplicate?a:event(refund(session,12000))
      await race(service,service2,
        async()=>assert.equal((await handlers.webhook(a,true,service)).status,200),
        async()=>assert.equal((await handlers.webhook(b,true,service2)).status,200))
      assert.equal((await ledger(f)).length,duplicate?1:2)
      assert.equal((await state(f)).payment_status,duplicate?'partially_refunded':'refunded')
    }
  })
  await test('paid-but-cancelled refund remains cancelled and cannot release inventory twice', async () => {
    const {f,session}=await ready()
    await adminChange(admin,f)
    const e=event(refund(session))
    assert.equal((await send(e)).status,200)
    await adminChange(admin,f)
    assert.equal((await send(e)).status,200)
    assert.equal((await state(f)).status,'cancelled')
    assert.equal((await state(f)).stock_quantity,10)
    assert.equal((await state(f)).stock_released,true)
  })
  await test('refund/admin races preserve cancellation and stock in both transaction orders', async () => {
    for(const refundFirst of [true,false]) {
      const {f,session}=await ready(),e=event(refund(session))
      if(refundFirst) await race(service,admin,()=>apply(service,f,e),()=>adminChange(admin,f))
      else await race(admin,service,()=>adminChange(admin,f),()=>apply(service,f,e))
      assert.equal((await state(f)).status,'cancelled')
      assert.equal((await state(f)).payment_status,'refunded')
      assert.equal((await state(f)).stock_quantity,10)
    }
  })
  await test('legacy processed refund marker is healed by verified replay, without deleting history', async () => {
    const {f,session}=await ready(),e=event(refund(session))
    await db.query('insert into xpay_webhook_events(event_id,event_type) values($1,$2)',[e.id,e.type])
    assert.equal((await send(e)).status,200)
    assert.equal((await seen(e)).refunds_applied,true)
    assert.equal((await seen(e)).payment_id,f.payment)
    assert.equal((await state(f)).payment_status,'refunded')
  })
  await test('historical full refund is never downgraded while its ledger is incomplete', async () => {
    const {f,session}=await ready()
    await service.query("select sync_xpay_payment_status($1,'refunded')",[f.payment])
    assert.equal((await send(event(refund(session,3000)))).status,200)
    assert.equal((await state(f)).payment_status,'refunded')
  })
  await test('late checkout success after refund is acknowledged without undoing financial state', async () => {
    const {f,session}=await ready()
    assert.equal((await send(event(refund(session)))).status,200)
    const e=eventFor(session)
    assert.equal((await send(e)).status,200)
    assert.equal((await send(e)).status,200)
    assert.equal((await state(f)).payment_status,'refunded')
    assert.equal((await state(f)).stock_quantity,8)
  })
  await test('concurrent refund and paid checkout cannot undo a refund; any raced failure is safely retryable', async () => {
    for(const refundFirst of [true,false]) {
      const {f,session}=await ready(),a=event(refund(session)),b=eventFor(session)
      if(refundFirst) {
        await race(service,service2,
          async()=>assert.equal((await handlers.webhook(a,true,service)).status,200),
          async()=>assert.equal((await handlers.webhook(b,true,service2)).status,200))
        assert.ok(await seen(b))
        assert.equal((await send(b)).status,200)
      } else {
        await race(service,service2,
          async()=>assert.equal((await handlers.webhook(b,true,service)).status,200),
          async()=>assert.equal((await handlers.webhook(a,true,service2)).status,200))
      }
      assert.equal((await state(f)).payment_status,'refunded')
      assert.equal((await state(f)).attempt_status,'refunded')
      assert.equal((await state(f)).stock_quantity,8)
    }
  })
  await test('event identity conflicts and ambiguous payment-intent associations remain retryable', async () => {
    const {f,session}=await ready(),e=event(refund(session))
    await db.query('insert into xpay_webhook_events(event_id,event_type,payment_id) values($1,$2,$3)',[e.id,'checkout.session.completed',f.payment])
    assert.equal((await send(e)).status,500)
    assert.equal((await ledger(f)).length,0)
    const other=await sessionFixture()
    await db.query('update payments set provider_payment_intent_id=$1 where id=$2',[session.paymentIntentId,other.f.payment])
    const next=event(refund(session))
    assert.equal((await send(next)).status,500)
    assert.equal(await seen(next),undefined)
  })
}
