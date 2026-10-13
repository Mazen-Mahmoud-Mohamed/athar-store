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
function egpToMinorUnits(amount) {
  return Math.round(amount * 100)
}
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

console.log('xpay signature + mode guards + webhook/stock idempotency: OK')
