/** XPay Hosted Checkout helpers — Test Mode only. */

export const XPAY_API_BASE = 'https://api.xpay.app'

export type XPayCheckoutSession = {
  id: string
  object?: string
  status?: string
  paymentStatus?: string
  url?: string | null
  amountTotal?: number
  currency?: string
  livemode?: boolean
  paymentIntentId?: string | null
  paymentIntent?: { id?: string | null } | null
  metadata?: Record<string, string> | null
  isExpired?: boolean
}

export type XPayEvent = {
  id: string
  type: string
  data?: {
    object?: XPayCheckoutSession & Record<string, unknown>
  }
}

export function requireTestSecretKey(secret: string | undefined): string {
  const key = (secret ?? '').trim()
  if (!key) {
    throw new Error('XPAY_SECRET_KEY_MISSING')
  }
  if (!key.startsWith('sk_test_')) {
    // Hard fail — this integration is Test Mode only.
    throw new Error('XPAY_LIVE_KEY_REJECTED')
  }
  return key
}

export function requireWebhookSecret(secret: string | undefined): string {
  const key = (secret ?? '').trim()
  if (!key) {
    throw new Error('XPAY_WEBHOOK_SECRET_MISSING')
  }
  if (!key.startsWith('whsec_')) {
    throw new Error('XPAY_WEBHOOK_SECRET_INVALID')
  }
  return key
}

export function egpToMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('INVALID_AMOUNT')
  }
  return Math.round(amount * 100)
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  )
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verify XPay-Signature: t=<unix>,v1=<hex hmac of `${t}.${rawBody}`>
 * Replay window: 300 seconds (per XPay docs).
 */
export async function verifyXPaySignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ valid: true; event: XPayEvent } | { valid: false; reason: string }> {
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

  if (Math.abs(nowSeconds - timestamp) > 300) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' }
  }

  const computed = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)
  if (!timingSafeEqualHex(computed, received)) {
    return { valid: false, reason: 'bad_signature' }
  }

  try {
    const event = JSON.parse(rawBody) as XPayEvent
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
      return { valid: false, reason: 'invalid_event' }
    }
    return { valid: true, event }
  } catch {
    return { valid: false, reason: 'invalid_json' }
  }
}

export async function createCheckoutSession(input: {
  secretKey: string
  lineItems: Array<{
    name: string
    unitAmountMinor: number
    quantity: number
  }>
  afterCompletionUrl: string
  cancelUrl: string
  metadata: Record<string, string>
  customerName?: string
  customerPhone?: string
  idempotencyKey?: string
}): Promise<XPayCheckoutSession> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.secretKey}`,
    'Content-Type': 'application/json',
  }
  if (input.idempotencyKey) {
    headers['Idempotency-Key'] = input.idempotencyKey
  }

  const body = {
    mode: 'payment',
    uiMode: 'hosted',
    locale: 'ar',
    currency: 'EGP',
    afterCompletion: {
      type: 'redirect',
      redirect: { url: input.afterCompletionUrl },
    },
    cancelUrl: input.cancelUrl,
    metadata: input.metadata,
    customerDetails: {
      name: input.customerName ?? undefined,
      phone: input.customerPhone ?? undefined,
    },
    lineItems: input.lineItems.map((item) => ({
      quantity: item.quantity,
      priceData: {
        currency: 'EGP',
        unitAmount: item.unitAmountMinor,
        productData: { name: item.name },
      },
    })),
  }

  const res = await fetch(`${XPAY_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof (payload as { message?: string }).message === 'string'
        ? (payload as { message: string }).message
        : 'XPAY_SESSION_CREATE_FAILED'
    throw new Error(message)
  }

  const session = payload as XPayCheckoutSession
  if (!session.id || !session.url) {
    throw new Error('XPAY_SESSION_INVALID_RESPONSE')
  }
  if (session.livemode === true || session.id.startsWith('cs_live_')) {
    throw new Error('XPAY_LIVE_SESSION_REJECTED')
  }
  return session
}

export async function retrieveCheckoutSession(
  secretKey: string,
  sessionId: string,
): Promise<XPayCheckoutSession> {
  const res = await fetch(
    `${XPAY_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    },
  )
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error('XPAY_SESSION_RETRIEVE_FAILED')
  }
  return payload as XPayCheckoutSession
}

export function mapSessionToInternalStatus(
  session: XPayCheckoutSession,
): 'pending' | 'requires_action' | 'successful' | 'failed' | 'cancelled' | 'expired' {
  if (session.isExpired || session.status === 'expired') return 'expired'
  if (session.paymentStatus === 'paid') return 'successful'
  if (session.status === 'complete' && session.paymentStatus === 'unpaid') {
    return 'requires_action'
  }
  if (session.status === 'open') return 'pending'
  return 'pending'
}
