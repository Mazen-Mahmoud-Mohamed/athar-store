/**
 * Practical unit checks for XPay webhook signatures, mode/key guards,
 * session-mode matching, duplicate-event skip, and stock-latch idempotency.
 *
 * Mirrors supabase/functions/_shared/xpay.ts. Never uses real credentials.
 *
 * Run: node scripts/_qa-xpay-signature.mjs
 */
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {
  createCheckoutSession as createXPayCheckoutSession,
  XPayUpstreamError,
} from '../supabase/functions/_shared/xpay.ts'

const TOLERANCE_SECONDS = 300

function resolveXpayMode(raw) {
  const mode = String(raw ?? '').trim().toLowerCase()
  if (!mode) throw new Error('XPAY_MODE_MISSING')
  if (mode !== 'test' && mode !== 'live') throw new Error('XPAY_MODE_INVALID')
  return mode
}

function requireSecretKeyForMode(mode, secret) {
  const key = String(secret ?? '').trim()
  if (!key) throw new Error('XPAY_SECRET_KEY_MISSING')
  if (mode === 'test' && !key.startsWith('sk_test_')) {
    throw new Error('XPAY_KEY_MODE_MISMATCH')
  }
  if (mode === 'live' && !key.startsWith('sk_live_')) {
    throw new Error('XPAY_KEY_MODE_MISMATCH')
  }
  return key
}

function requireWebhookSecret(secret) {
  const key = String(secret ?? '').trim()
  if (!key) throw new Error('XPAY_WEBHOOK_SECRET_MISSING')
  if (!key.startsWith('whsec_')) throw new Error('XPAY_WEBHOOK_SECRET_INVALID')
  return key
}

function collectWebhookSecrets({ primary, secondary }) {
  const first = requireWebhookSecret(primary)
  const secrets = [first]
  const extra = String(secondary ?? '').trim()
  if (!extra) return secrets
  const second = requireWebhookSecret(extra)
  if (second !== first) secrets.push(second)
  return secrets
}

function assertSessionMatchesMode(mode, session) {
  if (!session || typeof session !== 'object') throw new Error('XPAY_SESSION_MODE_MISMATCH')
  const id = String(session.id ?? '').trim()
  if (!id) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  const ids = {
    test: id.startsWith('cs_test_'),
    live: id.startsWith('cs_live_'),
  }
  const pi = String(session.paymentIntentId ?? session.paymentIntent?.id ?? '').trim()
  const intent = {
    test: pi.startsWith('pi_test_') || pi.startsWith('py_test_'),
    live: pi.startsWith('pi_live_') || pi.startsWith('py_live_'),
  }
  const livemode = session.livemode
  if (ids.test && ids.live) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (intent.test && intent.live) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (livemode === true && (ids.test || intent.test)) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (livemode === false && (ids.live || intent.live)) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (ids.test && intent.live) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (ids.live && intent.test) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  const evidenceTest = ids.test || livemode === false || intent.test
  const evidenceLive = ids.live || livemode === true || intent.live
  if (evidenceTest && evidenceLive) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (!evidenceTest && !evidenceLive) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (mode === 'test') {
    if (!evidenceTest || evidenceLive) throw new Error('XPAY_SESSION_MODE_MISMATCH')
    return
  }
  if (!evidenceLive || evidenceTest) throw new Error('XPAY_SESSION_MODE_MISMATCH')
}

function assertPaymentModeMatches(mode, payment) {
  if (payment.metadata?.mode !== mode) throw new Error('XPAY_PAYMENT_MODE_MISMATCH')
  if (payment.provider_session_id) {
    assertSessionMatchesMode(mode, { id: payment.provider_session_id })
  }
}

function egpToMinorUnits(amount) {
  const decimal = typeof amount === 'number' ? String(amount) : String(amount).trim()
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal)
  if (!match) throw new Error('INVALID_AMOUNT')
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_AMOUNT')
  return Number(minor)
}

function assertSessionMatchesPayment(mode, session, payment, order) {
  assertSessionMatchesMode(mode, session)
  assertPaymentModeMatches(mode, payment)

  if (
    payment.provider !== 'xpay' ||
    payment.order_id !== order.id ||
    order.payment_method !== 'xpay'
  ) {
    throw new Error('XPAY_PAYMENT_OWNERSHIP_MISMATCH')
  }

  const sessionMetadata = session.metadata ?? {}
  const expectedMetadata = {
    athar_payment_id: payment.id,
    athar_order_id: order.id,
    athar_mode: mode,
  }
  for (const [key, expected] of Object.entries(expectedMetadata)) {
    const actual = sessionMetadata[key]
    if (actual != null && actual !== expected) {
      throw new Error('XPAY_SESSION_OWNERSHIP_MISMATCH')
    }
  }
  if (payment.provider_session_id) {
    if (session.id !== payment.provider_session_id) {
      throw new Error('XPAY_SESSION_OWNERSHIP_MISMATCH')
    }
  } else if (
    sessionMetadata.athar_payment_id !== payment.id ||
    sessionMetadata.athar_order_id !== order.id ||
    sessionMetadata.athar_mode !== mode
  ) {
    throw new Error('XPAY_SESSION_OWNERSHIP_MISMATCH')
  }

  const paymentCurrency = String(payment.currency ?? '').trim().toUpperCase()
  const sessionCurrency = String(session.currency ?? '').trim().toUpperCase()
  if (!paymentCurrency || paymentCurrency !== 'EGP' || sessionCurrency !== paymentCurrency) {
    throw new Error('XPAY_CURRENCY_MISMATCH')
  }
  if (typeof session.amountTotal !== 'number' || !Number.isSafeInteger(session.amountTotal)) {
    throw new Error('XPAY_AMOUNT_MISMATCH')
  }
  const paymentMinor = egpToMinorUnits(payment.amount)
  const orderMinor = egpToMinorUnits(order.total)
  if (paymentMinor <= 0 || paymentMinor !== orderMinor || session.amountTotal !== paymentMinor) {
    throw new Error('XPAY_AMOUNT_MISMATCH')
  }
  return paymentMinor
}

function assertPaymentCanBeMarkedSuccessful(paymentStatus, orderStatus, orderPaymentStatus) {
  if (paymentStatus !== orderPaymentStatus) throw new Error('XPAY_PAYMENT_STATE_MISMATCH')
  if (paymentStatus === 'successful') return
  if (!['pending', 'requires_action', 'failed', 'cancelled', 'expired'].includes(paymentStatus)) {
    throw new Error('XPAY_PAYMENT_STATE_MISMATCH')
  }
  if (!['pending', 'cancelled'].includes(orderStatus)) {
    throw new Error('XPAY_PAYMENT_STATE_MISMATCH')
  }
  if (['successful', 'refunded', 'partially_refunded'].includes(orderPaymentStatus)) {
    throw new Error('XPAY_PAYMENT_STATE_MISMATCH')
  }
}

function isAuthoritativePaidSession(session) {
  return session.paymentStatus === 'paid'
}

function isPaidCheckoutEventType(eventType) {
  return (
    eventType === 'checkout.session.completed' ||
    eventType === 'checkout.session.async_payment_succeeded'
  )
}

/** Mirrors webhook: HMAC is assumed done; mode isolation then paid check. */
function evaluateWebhook(mode, event) {
  try {
    assertSessionMatchesMode(mode, event?.data?.object)
  } catch (error) {
    return { rejected: true, markPaid: false, reason: error.message }
  }
  const markPaid =
    isPaidCheckoutEventType(event.type) && isAuthoritativePaidSession(event.data.object)
  return { rejected: false, markPaid, reason: null }
}

function processVerifiedWebhook(mode, event, payment, order, seenIds) {
  const session = event?.data?.object
  assertSessionMatchesMode(mode, session)
  if (seenIds.has(event.id)) return { processed: false, duplicate: true, paymentStatus: payment.status }
  assertSessionMatchesPayment(mode, session, payment, order)
  if (isPaidCheckoutEventType(event.type) && isAuthoritativePaidSession(session)) {
    assertPaymentCanBeMarkedSuccessful(payment.status, order.status, order.payment_status)
    seenIds.add(event.id)
    return { processed: true, duplicate: false, paymentStatus: 'successful' }
  }
  seenIds.add(event.id)
  return { processed: true, duplicate: false, paymentStatus: payment.status }
}

function reconcilePaymentStatus(mode, session, payment, order) {
  assertSessionMatchesPayment(mode, session, payment, order)
  if (session.paymentStatus === 'paid') {
    assertPaymentCanBeMarkedSuccessful(payment.status, order.status, order.payment_status)
    return 'successful'
  }
  return payment.status
}

function verifyXPaySignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header) return { valid: false, reason: 'missing_header' }

  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [k, ...rest] = part.trim().split('=')
      return [k, rest.join('=')]
    }),
  )

  const timestamp = Number.parseInt(parts.t ?? '', 10)
  const received = parts.v1
  if (!Number.isFinite(timestamp) || !received) {
    return { valid: false, reason: 'malformed_header' }
  }

  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' }
  }

  const computed = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(computed)
  const b = Buffer.from(received)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad_signature' }
  }

  return { valid: true, event: JSON.parse(rawBody) }
}

function verifyXPaySignatureWithSecrets(rawBody, header, secrets, nowSeconds) {
  if (!header) return { valid: false, reason: 'missing_header' }
  if (!secrets.length) return { valid: false, reason: 'missing_secret' }
  let lastReason = 'bad_signature'
  for (const secret of secrets) {
    const result = verifyXPaySignature(rawBody, header, secret, nowSeconds)
    if (result.valid) return result
    lastReason = result.reason
    if (result.reason === 'malformed_header' || result.reason === 'timestamp_out_of_tolerance') {
      return result
    }
  }
  return { valid: false, reason: lastReason }
}

function sign(rawBody, secret, t) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return `t=${t},v1=${v1}`
}

const secret = 'whsec_test_athar_signature_secret'
const secondary = 'whsec_test_athar_secondary_secret'
const body = JSON.stringify({
  id: 'evt_test_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', paymentStatus: 'paid', status: 'complete' } },
})
const now = Math.floor(Date.now() / 1000)

// 1) Valid signature
{
  const header = sign(body, secret, now)
  const result = verifyXPaySignature(body, header, secret, now)
  assert.equal(result.valid, true)
  assert.equal(result.event.id, 'evt_test_1')
}

// 2) Invalid signature
{
  const header = sign(body, secret, now).replace(/v1=([0-9a-f])/, (_, firstHex) =>
    `v1=${firstHex === '0' ? '1' : '0'}`,
  )
  const result = verifyXPaySignature(body, header, secret, now)
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'bad_signature')
}

// 3) Replay outside tolerance
{
  const header = sign(body, secret, now - 301)
  const result = verifyXPaySignature(body, header, secret, now)
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'timestamp_out_of_tolerance')
}

// 4) Missing header — unsigned never accepted
{
  const result = verifyXPaySignature(body, undefined, secret, now)
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'missing_header')
  const multi = verifyXPaySignatureWithSecrets(body, undefined, [secret], now)
  assert.equal(multi.valid, false)
  assert.equal(multi.reason, 'missing_header')
}

// 5) Mode configuration — fail closed
assert.equal(resolveXpayMode('test'), 'test')
assert.equal(resolveXpayMode('LIVE'), 'live')
assert.throws(() => resolveXpayMode(undefined), /XPAY_MODE_MISSING/)
assert.throws(() => resolveXpayMode(''), /XPAY_MODE_MISSING/)
assert.throws(() => resolveXpayMode('sandbox'), /XPAY_MODE_INVALID/)

// 6) Key prefixes vs configured mode (placeholders only)
assert.equal(requireSecretKeyForMode('test', 'sk_test_placeholder'), 'sk_test_placeholder')
assert.equal(requireSecretKeyForMode('live', 'sk_live_placeholder'), 'sk_live_placeholder')
assert.throws(() => requireSecretKeyForMode('test', 'sk_live_placeholder'), /XPAY_KEY_MODE_MISMATCH/)
assert.throws(() => requireSecretKeyForMode('live', 'sk_test_placeholder'), /XPAY_KEY_MODE_MISMATCH/)
assert.throws(() => requireSecretKeyForMode('test', ''), /XPAY_SECRET_KEY_MISSING/)
assert.throws(() => requireSecretKeyForMode('live', undefined), /XPAY_SECRET_KEY_MISSING/)

// 7) Session livemode / id mismatches — fail closed without evidence
assert.doesNotThrow(() =>
  assertSessionMatchesMode('test', { id: 'cs_test_abc', livemode: false }),
)
assert.doesNotThrow(() =>
  assertSessionMatchesMode('live', { id: 'cs_live_abc', livemode: true }),
)
assert.doesNotThrow(() => assertSessionMatchesMode('test', { id: 'cs_test_abc' }))
assert.doesNotThrow(() => assertSessionMatchesMode('live', { id: 'cs_live_abc' }))
assert.throws(
  () => assertSessionMatchesMode('test', { id: 'cs_live_abc', livemode: true }),
  /XPAY_SESSION_MODE_MISMATCH/,
)
assert.throws(
  () => assertSessionMatchesMode('live', { id: 'cs_test_abc', livemode: false }),
  /XPAY_SESSION_MODE_MISMATCH/,
)
assert.throws(
  () => assertSessionMatchesMode('live', { id: 'cs_unknown', livemode: undefined }),
  /XPAY_SESSION_MODE_MISMATCH/,
)
assert.throws(
  () => assertSessionMatchesMode('test', { id: 'cs_unknown', livemode: undefined }),
  /XPAY_SESSION_MODE_MISMATCH/,
)
assert.throws(() => assertSessionMatchesMode('test', { id: '' }), /XPAY_SESSION_MODE_MISMATCH/)
assert.throws(() => assertSessionMatchesMode('live', null), /XPAY_SESSION_MODE_MISMATCH/)
assert.throws(
  () =>
    assertSessionMatchesMode('test', {
      id: 'cs_test_abc',
      livemode: true,
    }),
  /XPAY_SESSION_MODE_MISMATCH/,
)
assert.throws(
  () =>
    assertSessionMatchesMode('live', {
      id: 'cs_live_abc',
      paymentIntentId: 'pi_test_abc',
    }),
  /XPAY_SESSION_MODE_MISMATCH/,
)

// 8) Webhook secrets — primary required, secondary explicit only
{
  const one = collectWebhookSecrets({ primary: secret })
  assert.deepEqual(one, [secret])
  const two = collectWebhookSecrets({ primary: secret, secondary })
  assert.deepEqual(two, [secret, secondary])
  const deduped = collectWebhookSecrets({ primary: secret, secondary: secret })
  assert.deepEqual(deduped, [secret])
  assert.throws(() => collectWebhookSecrets({ primary: undefined }), /XPAY_WEBHOOK_SECRET_MISSING/)
  assert.throws(() => collectWebhookSecrets({ primary: 'not-a-whsec' }), /XPAY_WEBHOOK_SECRET_INVALID/)
}

// 9) Dual explicit secrets: valid on either; unsigned still rejected
{
  const secrets = collectWebhookSecrets({ primary: secret, secondary })
  const headerPrimary = sign(body, secret, now)
  const headerSecondary = sign(body, secondary, now)
  assert.equal(verifyXPaySignatureWithSecrets(body, headerPrimary, secrets, now).valid, true)
  assert.equal(verifyXPaySignatureWithSecrets(body, headerSecondary, secrets, now).valid, true)
  const wrong = sign(body, 'whsec_unrelated_placeholder', now)
  assert.equal(verifyXPaySignatureWithSecrets(body, wrong, secrets, now).valid, false)
}

// 10) Duplicate webhook event skip (handler semantics)
function applyWebhookEvent(seenIds, eventId) {
  if (seenIds.has(eventId)) return { processed: false, duplicate: true }
  seenIds.add(eventId)
  return { processed: true, duplicate: false }
}
{
  const seen = new Set()
  const first = applyWebhookEvent(seen, 'evt_test_1')
  const second = applyWebhookEvent(seen, 'evt_test_1')
  assert.equal(first.processed, true)
  assert.equal(second.processed, false)
  assert.equal(second.duplicate, true)
  assert.equal(seen.size, 1)
}

// 11) Stock latch — paid is idempotent; cancel restores once
function markPaid(state, qty = 1) {
  if (state.paymentStatus === 'successful') {
    return { ...state, alreadyPaid: true }
  }
  let stock = state.stock
  if (state.stockReleased) stock -= qty
  return {
    ...state,
    paymentStatus: 'successful',
    orderStatus: 'confirmed',
    stockReleased: false,
    stock,
    alreadyPaid: false,
  }
}
function cancelUnpaid(state, qty = 1) {
  if (state.paymentStatus === 'successful' || state.paymentStatus === 'refunded') {
    return { ...state }
  }
  if (state.stockReleased) return { ...state }
  return {
    ...state,
    paymentStatus: 'failed',
    orderStatus: 'cancelled',
    stockReleased: true,
    stock: state.stock + qty,
  }
}
{
  let state = {
    paymentStatus: 'pending',
    orderStatus: 'pending',
    stockReleased: false,
    stock: 12,
  }
  state = markPaid(state)
  assert.equal(state.stock, 12)
  assert.equal(state.paymentStatus, 'successful')
  const again = markPaid(state)
  assert.equal(again.alreadyPaid, true)
  assert.equal(again.stock, 12)

  let unpaid = {
    paymentStatus: 'pending',
    orderStatus: 'pending',
    stockReleased: false,
    stock: 11,
  }
  unpaid = cancelUnpaid(unpaid)
  assert.equal(unpaid.stock, 12)
  assert.equal(unpaid.stockReleased, true)
  const cancelAgain = cancelUnpaid(unpaid)
  assert.equal(cancelAgain.stock, 12)

  let revived = markPaid(unpaid)
  assert.equal(revived.stock, 11)
  assert.equal(revived.stockReleased, false)
  const reviveAgain = markPaid(revived)
  assert.equal(reviveAgain.stock, 11)
}

// 12) Minor units
assert.equal(egpToMinorUnits(1499), 149900)
assert.equal(egpToMinorUnits(10.5), 1050)

// 13) Webhook mode isolation (HMAC already verified; secondary cannot skip this)
{
  const testPaid = {
    id: 'evt_test_paid',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', livemode: false, paymentStatus: 'paid', status: 'complete' } },
  }
  const livePaid = {
    id: 'evt_live_paid',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_live_1', livemode: true, paymentStatus: 'paid', status: 'complete' } },
  }
  const testUnpaid = {
    id: 'evt_test_unpaid',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_2', livemode: false, paymentStatus: 'unpaid', status: 'complete' } },
  }
  const testFailed = {
    id: 'evt_test_failed',
    type: 'checkout.session.async_payment_failed',
    data: { object: { id: 'cs_test_3', livemode: false, paymentStatus: 'unpaid', status: 'complete' } },
  }
  const testExpired = {
    id: 'evt_test_expired',
    type: 'checkout.session.expired',
    data: { object: { id: 'cs_test_4', livemode: false, paymentStatus: 'unpaid', status: 'expired' } },
  }
  const missingMode = {
    id: 'evt_unknown',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_unknown', paymentStatus: 'paid' } },
  }
  const metadataOnly = {
    id: 'evt_meta',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_unknown',
        paymentStatus: 'paid',
        metadata: { athar_mode: 'test' },
      },
    },
  }

  const testOk = evaluateWebhook('test', testPaid)
  assert.equal(testOk.rejected, false)
  assert.equal(testOk.markPaid, true)

  const liveOk = evaluateWebhook('live', livePaid)
  assert.equal(liveOk.rejected, false)
  assert.equal(liveOk.markPaid, true)

  const testInLive = evaluateWebhook('live', testPaid)
  assert.equal(testInLive.rejected, true)
  assert.equal(testInLive.markPaid, false)

  const liveInTest = evaluateWebhook('test', livePaid)
  assert.equal(liveInTest.rejected, true)
  assert.equal(liveInTest.markPaid, false)

  const unpaid = evaluateWebhook('test', testUnpaid)
  assert.equal(unpaid.rejected, false)
  assert.equal(unpaid.markPaid, false)

  const failed = evaluateWebhook('test', testFailed)
  assert.equal(failed.rejected, false)
  assert.equal(failed.markPaid, false)

  const expired = evaluateWebhook('test', testExpired)
  assert.equal(expired.rejected, false)
  assert.equal(expired.markPaid, false)

  const malformed = evaluateWebhook('test', missingMode)
  assert.equal(malformed.rejected, true)
  assert.equal(malformed.markPaid, false)

  const metaBypass = evaluateWebhook('test', metadataOnly)
  assert.equal(metaBypass.rejected, true)
  assert.equal(metaBypass.markPaid, false)

  // Dual HMAC secrets still require matching session mode
  const secrets = collectWebhookSecrets({ primary: secret, secondary })
  const liveBody = JSON.stringify(livePaid)
  const liveHeader = sign(liveBody, secondary, now)
  const hmacOk = verifyXPaySignatureWithSecrets(liveBody, liveHeader, secrets, now)
  assert.equal(hmacOk.valid, true)
  const isolated = evaluateWebhook('test', hmacOk.event)
  assert.equal(isolated.rejected, true)
  assert.equal(isolated.markPaid, false)
}

// 14) Verified payment evidence and fail-closed amount/currency checks
function makeEvidence(mode = 'live') {
  const sessionId = mode === 'live' ? 'cs_live_1' : 'cs_test_1'
  const session = {
    id: sessionId,
    livemode: mode === 'live',
    status: 'complete',
    paymentStatus: 'paid',
    amountTotal: 12345,
    currency: 'EGP',
    metadata: {
      athar_payment_id: 'pay_1',
      athar_order_id: 'order_1',
      athar_mode: mode,
    },
  }
  const payment = {
    id: 'pay_1',
    order_id: 'order_1',
    provider: 'xpay',
    status: 'pending',
    amount: '123.45',
    currency: 'EGP',
    provider_session_id: sessionId,
    metadata: { mode },
  }
  const order = {
    id: 'order_1',
    status: 'pending',
    payment_method: 'xpay',
    payment_status: 'pending',
    total: '123.45',
  }
  return { session, payment, order }
}

assert.equal(egpToMinorUnits('123.45'), 12345)
assert.equal(egpToMinorUnits(10.5), 1050)
assert.throws(() => egpToMinorUnits('123.456'), /INVALID_AMOUNT/)
assert.throws(() => egpToMinorUnits('-1.00'), /INVALID_AMOUNT/)

{
  const valid = makeEvidence()
  assert.equal(assertSessionMatchesPayment('live', ...Object.values(valid)), 12345)
  assert.equal(reconcilePaymentStatus('live', valid.session, valid.payment, valid.order), 'successful')

  const noAmount = makeEvidence()
  noAmount.session.amountTotal = undefined
  assert.throws(
    () => processVerifiedWebhook('live', { id: 'evt_missing_amount', type: 'checkout.session.completed', data: { object: noAmount.session } }, noAmount.payment, noAmount.order, new Set()),
    /XPAY_AMOUNT_MISMATCH/,
  )
  assert.throws(
    () => reconcilePaymentStatus('live', noAmount.session, noAmount.payment, noAmount.order),
    /XPAY_AMOUNT_MISMATCH/,
  )

  const wrongAmount = makeEvidence()
  wrongAmount.session.amountTotal = 12344
  assert.throws(
    () => processVerifiedWebhook('live', { id: 'evt_wrong_amount', type: 'checkout.session.completed', data: { object: wrongAmount.session } }, wrongAmount.payment, wrongAmount.order, new Set()),
    /XPAY_AMOUNT_MISMATCH/,
  )

  const missingCurrency = makeEvidence()
  missingCurrency.session.currency = undefined
  assert.throws(
    () => reconcilePaymentStatus('live', missingCurrency.session, missingCurrency.payment, missingCurrency.order),
    /XPAY_CURRENCY_MISMATCH/,
  )

  const fractionalAmount = makeEvidence()
  fractionalAmount.session.amountTotal = 12345.5
  assert.throws(
    () => reconcilePaymentStatus('live', fractionalAmount.session, fractionalAmount.payment, fractionalAmount.order),
    /XPAY_AMOUNT_MISMATCH/,
  )

  const wrongCurrency = makeEvidence()
  wrongCurrency.session.currency = 'USD'
  assert.throws(
    () => processVerifiedWebhook('live', { id: 'evt_wrong_currency', type: 'checkout.session.completed', data: { object: wrongCurrency.session } }, wrongCurrency.payment, wrongCurrency.order, new Set()),
    /XPAY_CURRENCY_MISMATCH/,
  )

  const wrongOwner = makeEvidence()
  wrongOwner.session.id = 'cs_live_other'
  assert.throws(
    () => reconcilePaymentStatus('live', wrongOwner.session, wrongOwner.payment, wrongOwner.order),
    /XPAY_SESSION_OWNERSHIP_MISMATCH/,
  )

  const wrongMetadataOwner = makeEvidence()
  wrongMetadataOwner.session.metadata.athar_payment_id = 'pay_other'
  assert.throws(
    () => processVerifiedWebhook('live', { id: 'evt_wrong_owner', type: 'checkout.session.completed', data: { object: wrongMetadataOwner.session } }, wrongMetadataOwner.payment, wrongMetadataOwner.order, new Set()),
    /XPAY_SESSION_OWNERSHIP_MISMATCH/,
  )

  const wrongMode = makeEvidence('test')
  assert.throws(
    () => reconcilePaymentStatus('live', wrongMode.session, wrongMode.payment, wrongMode.order),
    /XPAY_SESSION_MODE_MISMATCH/,
  )

  const storedTestAttempt = makeEvidence()
  storedTestAttempt.payment.metadata.mode = 'test'
  assert.throws(
    () => reconcilePaymentStatus('live', storedTestAttempt.session, storedTestAttempt.payment, storedTestAttempt.order),
    /XPAY_PAYMENT_MODE_MISMATCH/,
  )

  const metadataBoundAttempt = makeEvidence()
  metadataBoundAttempt.payment.provider_session_id = null
  assert.equal(
    assertSessionMatchesPayment('live', metadataBoundAttempt.session, metadataBoundAttempt.payment, metadataBoundAttempt.order),
    12345,
  )
  metadataBoundAttempt.session.metadata.athar_order_id = 'order_other'
  assert.throws(
    () => reconcilePaymentStatus('live', metadataBoundAttempt.session, metadataBoundAttempt.payment, metadataBoundAttempt.order),
    /XPAY_SESSION_OWNERSHIP_MISMATCH/,
  )

  const inconsistentOrder = makeEvidence()
  inconsistentOrder.order.total = '123.44'
  assert.throws(
    () => reconcilePaymentStatus('live', inconsistentOrder.session, inconsistentOrder.payment, inconsistentOrder.order),
    /XPAY_AMOUNT_MISMATCH/,
  )

  const zeroAmount = makeEvidence()
  zeroAmount.session.amountTotal = 0
  zeroAmount.payment.amount = '0.00'
  zeroAmount.order.total = '0.00'
  assert.throws(
    () => reconcilePaymentStatus('live', zeroAmount.session, zeroAmount.payment, zeroAmount.order),
    /XPAY_AMOUNT_MISMATCH/,
  )

  const progressedOrder = makeEvidence()
  progressedOrder.order.status = 'shipped'
  assert.throws(
    () => reconcilePaymentStatus('live', progressedOrder.session, progressedOrder.payment, progressedOrder.order),
    /XPAY_PAYMENT_STATE_MISMATCH/,
  )
}

// 15) Verified webhook duplicates are idempotent; invalid evidence is not recorded
{
  const evidence = makeEvidence()
  const seen = new Set()
  const event = {
    id: 'evt_verified_paid',
    type: 'checkout.session.completed',
    data: { object: evidence.session },
  }
  const first = processVerifiedWebhook('live', event, evidence.payment, evidence.order, seen)
  evidence.payment.status = 'successful'
  evidence.order.status = 'confirmed'
  evidence.order.payment_status = 'successful'
  const duplicate = processVerifiedWebhook('live', event, evidence.payment, evidence.order, seen)
  assert.equal(first.paymentStatus, 'successful')
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.paymentStatus, 'successful')
  assert.equal(seen.size, 1)

  const invalid = makeEvidence()
  invalid.session.currency = 'USD'
  const invalidSeen = new Set()
  assert.throws(
    () => processVerifiedWebhook('live', { ...event, id: 'evt_invalid_paid', data: { object: invalid.session } }, invalid.payment, invalid.order, invalidSeen),
    /XPAY_CURRENCY_MISMATCH/,
  )
  assert.equal(invalidSeen.size, 0)
}

// 16) XPay create-session success and nested upstream error diagnostics
{
  const originalFetch = globalThis.fetch
  const liveSession = {
    id: 'cs_live_create_1',
    url: 'https://checkout.xpay.app/c/cs_live_create_1',
    livemode: true,
    amountTotal: 12345,
    currency: 'EGP',
  }
  let capturedRequest
  try {
    globalThis.fetch = async (url, request) => {
      capturedRequest = { url, ...request }
      return new Response(JSON.stringify(liveSession), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const createInput = {
      secretKey: 'sk_live_placeholder',
      mode: 'live',
      idempotencyKey: 'athar_payment_1',
      afterCompletionUrl: 'https://athar.qd.je/order-success',
      cancelUrl: 'https://athar.qd.je/order-success?xpay_cancel=1',
      metadata: { athar_payment_id: 'pay_test_only', athar_mode: 'live' },
      customerName: 'Test Customer Name',
      customerPhone: '+201012345678',
      lineItems: [{ name: 'Example product', unitAmountMinor: 12345, quantity: 1 }],
    }

    const created = await createXPayCheckoutSession(createInput)
    assert.equal(created.id, 'cs_live_create_1')
    assert.equal(created.url, liveSession.url)
    assert.equal(capturedRequest.url, 'https://api.xpay.app/checkout/sessions')
    assert.equal(capturedRequest.method, 'POST')
    assert.equal(capturedRequest.headers.Authorization, 'Bearer sk_live_placeholder')
    assert.equal(capturedRequest.headers['Content-Type'], 'application/json')
    assert.equal(capturedRequest.headers['Idempotency-Key'], 'athar_payment_1')
    const requestBody = JSON.parse(capturedRequest.body)
    assert.equal(requestBody.lineItems[0].priceData.unitAmount, 12345)
    assert.deepEqual(requestBody.afterCompletion, {
      type: 'redirect',
      redirect: { url: createInput.afterCompletionUrl },
    })

    globalThis.fetch = async () => new Response(JSON.stringify({
      error: {
        type: 'invalid_request_error',
        code: 'parameter_invalid',
        message: 'Invalid phone +201012345678 for Test Customer Name test@example.com',
        param: 'customerDetails.phone',
      },
      request_id: 'req_safe_123',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

    let upstreamFailure
    try {
      await createXPayCheckoutSession({ ...createInput, idempotencyKey: 'athar_payment_2' })
    } catch (error) {
      upstreamFailure = error
    }
    assert.ok(upstreamFailure instanceof XPayUpstreamError)
    assert.equal(upstreamFailure.message, 'XPAY_SESSION_CREATE_FAILED')
    assert.deepEqual(upstreamFailure.details, {
      status: 400,
      type: 'invalid_request_error',
      code: 'parameter_invalid',
      param: 'customerDetails.phone',
      requestId: 'req_safe_123',
      message: 'Invalid phone [redacted] for [redacted] [redacted-email]',
    })
    assert.equal(JSON.stringify(upstreamFailure.details).includes('+201012345678'), false)
    assert.equal(JSON.stringify(upstreamFailure.details).includes('Test Customer Name'), false)
    assert.equal(JSON.stringify(upstreamFailure.details).includes('test@example.com'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
}

console.log('xpay signature + mode guards + webhook/stock idempotency: OK')
