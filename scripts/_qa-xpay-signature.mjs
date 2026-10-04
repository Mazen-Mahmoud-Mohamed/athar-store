/**
 * Practical unit checks for XPay webhook signature verification
 * (mirrors supabase/functions/_shared/xpay.ts algorithm).
 *
 * Run: node scripts/_qa-xpay-signature.mjs
 */
import crypto from 'node:crypto'
import assert from 'node:assert/strict'

const TOLERANCE_SECONDS = 300

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

function sign(rawBody, secret, t) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return `t=${t},v1=${v1}`
}

const secret = 'whsec_test_athar_signature_secret'
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

// 4) Missing header
{
  const result = verifyXPaySignature(body, undefined, secret, now)
  assert.equal(result.valid, false)
}

// 5) Test-mode key guard
function requireTestSecretKey(key) {
  if (!key?.startsWith('sk_test_')) throw new Error('XPAY_LIVE_KEY_REJECTED')
  return key
}
assert.equal(requireTestSecretKey('sk_test_abc'), 'sk_test_abc')
assert.throws(() => requireTestSecretKey('sk_live_abc'), /XPAY_LIVE_KEY_REJECTED/)

// 6) Minor units
function egpToMinorUnits(amount) {
  return Math.round(amount * 100)
}
assert.equal(egpToMinorUnits(1499), 149900)
assert.equal(egpToMinorUnits(10.5), 1050)

console.log('xpay signature + test-mode guards: OK')
