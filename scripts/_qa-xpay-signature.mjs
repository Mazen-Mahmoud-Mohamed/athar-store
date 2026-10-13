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
  const id = String(session.id ?? '')
  const liveId = id.startsWith('cs_live_')
  const testId = id.startsWith('cs_test_')
  const livemode = session.livemode
  if (mode === 'test') {
    if (livemode === true || liveId) throw new Error('XPAY_SESSION_MODE_MISMATCH')
    return
  }
  if (livemode === false || testId) throw new Error('XPAY_SESSION_MODE_MISMATCH')
  if (livemode !== true && !liveId) throw new Error('XPAY_SESSION_MODE_MISMATCH')
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
  const header = sign(body, secret, now).replace(/v1=./, 'v1=0')
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

// 7) Session livemode / id mismatches
assert.doesNotThrow(() =>
  assertSessionMatchesMode('test', { id: 'cs_test_abc', livemode: false }),
)
assert.doesNotThrow(() =>
  assertSessionMatchesMode('live', { id: 'cs_live_abc', livemode: true }),
)
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

console.log('xpay signature + mode guards + webhook/stock idempotency: OK')
