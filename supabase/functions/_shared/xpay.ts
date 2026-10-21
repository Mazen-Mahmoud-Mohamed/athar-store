/** XPay Hosted Checkout helpers — Test or Live according to XPAY_MODE. */

export const XPAY_API_BASE = 'https://api.xpay.app'

export type XPayMode = 'test' | 'live'

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
  livemode?: boolean
  data?: {
    object?: Record<string, unknown>
  }
}

export function isRefundEventType(type: string): boolean {
  return ['refund.created', 'refund.failed', 'charge.refunded'].includes(type)
}

/** Normalize only signed provider objects, never checkout-session-shaped refunds. */
export function parseRefundEvent(mode: XPayMode, event: XPayEvent) {
  const invalid = (): never => { throw new Error('XPAY_REFUND_INVALID') }
  const identifier = (value: unknown, prefix: string): string => {
    if (typeof value !== 'string' || !new RegExp(`^${prefix}_${mode}_[A-Za-z0-9_-]+$`).test(value)) return invalid()
    return value
  }
  const money = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalid()
    return value
  }
  if (!isRefundEventType(event.type) || event.livemode !== (mode === 'live')) return invalid()
  identifier(event.id, 'evt')
  const object = asRecord(event.data?.object)
  const intentId = identifier(object.paymentIntentId, 'pi')
  const refund = (value: unknown) => {
    const row = asRecord(value)
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : ''
    if (row.object !== 'refund' || row.currency !== 'EGP' ||
        !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(status) ||
        row.paymentIntentId !== intentId) return invalid()
    return { id: identifier(row.id, 're'), charge_id: identifier(row.chargeId, 'ch'),
      payment_intent_id: intentId, amount_minor: money(row.amount), currency: 'EGP', status }
  }
  if (event.type !== 'charge.refunded') {
    const row = refund(object)
    if (event.type === 'refund.failed' && row.status !== 'failed') return invalid()
    return { intentId, refunds: [row], chargeAmount: null }
  }
  const chargeId = identifier(object.id, 'ch')
  const chargeAmount = money(object.amount)
  const refunded = money(object.amountRefunded)
  if (object.object !== 'charge' || object.currency !== 'EGP' ||
      object.paid !== true || object.captured !== true ||
      object.amountCaptured !== chargeAmount || refunded > chargeAmount) return invalid()
  // API reference uses an array; the event guide also documents refunds.data.
  const list = asRecord(object.refunds)
  const values = Array.isArray(object.refunds) ? object.refunds : list.data
  if (!Array.isArray(values) || !values.length || list.has_more === true) return invalid()
  const refunds = values.map(refund)
  if (new Set(refunds.map(row => row.id)).size !== refunds.length ||
      refunds.some(row => row.charge_id !== chargeId) ||
      refunds.filter(row => row.status === 'succeeded').reduce((sum, row) => sum + row.amount_minor, 0) !== refunded) return invalid()
  return { intentId, refunds, chargeAmount }
}

export type XPayUpstreamErrorDetails = {
  status: number
  type?: string
  code?: string
  param?: string
  requestId?: string
  message?: string
}

export class XPayUpstreamError extends Error {
  readonly details: XPayUpstreamErrorDetails

  constructor(details: XPayUpstreamErrorDetails) {
    super('XPAY_SESSION_CREATE_FAILED')
    this.name = 'XPayUpstreamError'
    this.details = details
  }
}

function safeErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value)
    ? value
    : undefined
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sanitizeUpstreamMessage(message: string, sensitiveValues: string[]): string {
  let safe = message
  for (const value of sensitiveValues) {
    const sensitive = value.trim()
    if (sensitive.length >= 3) {
      safe = safe.replace(new RegExp(escapeRegExp(sensitive), 'gi'), '[redacted]')
    }
  }
  return safe
    .replace(/\bsk_(?:test|live)_[A-Za-z0-9_-]+\b/gi, '[redacted-secret]')
    .replace(/\bwhsec_[A-Za-z0-9_-]+\b/gi, '[redacted-secret]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[redacted-phone]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240)
}

export function parseXPayUpstreamError(
  status: number,
  payload: unknown,
  sensitiveValues: string[] = [],
): XPayUpstreamErrorDetails {
  const root = asRecord(payload)
  const error = asRecord(root.error)
  const requestId = safeErrorCode(root.request_id ?? error.request_id)
  const message = typeof error.message === 'string'
    ? error.message
    : typeof root.message === 'string'
      ? root.message
      : undefined

  return {
    status,
    type: safeErrorCode(error.type),
    code: safeErrorCode(error.code),
    param: safeErrorCode(error.param),
    requestId,
    ...(message ? { message: sanitizeUpstreamMessage(message, sensitiveValues) } : {}),
  }
}

export function resolveXpayMode(raw: string | undefined): XPayMode {
  const mode = (raw ?? '').trim().toLowerCase()
  if (!mode) {
    throw new Error('XPAY_MODE_MISSING')
  }
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('XPAY_MODE_INVALID')
  }
  return mode
}

export function requireSecretKeyForMode(
  mode: XPayMode,
  secret: string | undefined,
): string {
  const key = (secret ?? '').trim()
  if (!key) {
    throw new Error('XPAY_SECRET_KEY_MISSING')
  }
  if (mode === 'test') {
    if (!key.startsWith('sk_test_')) {
      throw new Error('XPAY_KEY_MODE_MISMATCH')
    }
    return key
  }
  if (!key.startsWith('sk_live_')) {
    throw new Error('XPAY_KEY_MODE_MISMATCH')
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

/**
 * Signing secrets for HMAC only.
 * Primary (XPAY_WEBHOOK_SECRET) is required.
 * Optional XPAY_WEBHOOK_SECRET_SECONDARY verifies a second Dashboard secret
 * during cutover. A valid secondary signature never skips XPAY_MODE checks.
 * Unsigned requests are never accepted. Test and Live secrets are not interchangeable.
 */
export function collectWebhookSecrets(input: {
  primary: string | undefined
  secondary?: string | undefined
}): string[] {
  const primary = requireWebhookSecret(input.primary)
  const secrets = [primary]
  const secondaryRaw = (input.secondary ?? '').trim()
  if (!secondaryRaw) return secrets
  const secondary = requireWebhookSecret(secondaryRaw)
  if (secondary !== primary) secrets.push(secondary)
  return secrets
}

function sessionIdEvidence(id: string): { test: boolean; live: boolean } {
  return {
    test: id.startsWith('cs_test_'),
    live: id.startsWith('cs_live_'),
  }
}

function paymentIntentEvidence(session: XPayCheckoutSession): {
  test: boolean
  live: boolean
} {
  const pi = String(session.paymentIntentId ?? session.paymentIntent?.id ?? '').trim()
  if (!pi) return { test: false, live: false }
  return {
    test: pi.startsWith('pi_test_') || pi.startsWith('py_test_'),
    live: pi.startsWith('pi_live_') || pi.startsWith('py_live_'),
  }
}

/**
 * Fail closed: require authoritative Test or Live evidence (id prefix and/or
 * livemode). Metadata is ignored. Contradictory signals are rejected.
 */
export function assertSessionMatchesMode(
  mode: XPayMode,
  session: XPayCheckoutSession | null | undefined,
): void {
  if (!session || typeof session !== 'object') {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }

  const id = String(session.id ?? '').trim()
  if (!id) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }

  const ids = sessionIdEvidence(id)
  const intent = paymentIntentEvidence(session)
  const livemode = session.livemode

  if (ids.test && ids.live) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }
  if (intent.test && intent.live) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }
  if (livemode === true && (ids.test || intent.test)) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }
  if (livemode === false && (ids.live || intent.live)) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }
  if (ids.test && intent.live) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }
  if (ids.live && intent.test) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }

  const evidenceTest = ids.test || livemode === false || intent.test
  const evidenceLive = ids.live || livemode === true || intent.live

  if (evidenceTest && evidenceLive) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }
  if (!evidenceTest && !evidenceLive) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }

  if (mode === 'test') {
    if (!evidenceTest || evidenceLive) {
      throw new Error('XPAY_SESSION_MODE_MISMATCH')
    }
    return
  }

  if (!evidenceLive || evidenceTest) {
    throw new Error('XPAY_SESSION_MODE_MISMATCH')
  }
}

/** Paid confirmation uses provider paymentStatus, never metadata. */
export function isAuthoritativePaidSession(session: XPayCheckoutSession): boolean {
  return session.paymentStatus === 'paid'
}

export function isPaidCheckoutEventType(eventType: string): boolean {
  return (
    eventType === 'checkout.session.completed' ||
    eventType === 'checkout.session.async_payment_succeeded'
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function assertPaymentModeMatches(
  mode: XPayMode,
  payment: { provider_session_id: string | null; metadata: unknown },
): void {
  if (asRecord(payment.metadata).mode !== mode) {
    throw new Error('XPAY_PAYMENT_MODE_MISMATCH')
  }
  if (payment.provider_session_id) {
    assertSessionMatchesMode(mode, { id: payment.provider_session_id })
  }
}

export function egpToMinorUnits(amount: number | string): number {
  const decimal = typeof amount === 'number' ? String(amount) : amount.trim()
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal)
  if (!match) {
    throw new Error('INVALID_AMOUNT')
  }

  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('INVALID_AMOUNT')
  }
  return Number(minor)
}

export function assertSessionMatchesPayment(
  mode: XPayMode,
  session: XPayCheckoutSession,
  payment: {
    id: string
    order_id: string
    provider: string
    status: string
    amount: number | string
    currency: string | null
    provider_session_id: string | null
    metadata: unknown
  },
  order: {
    id: string
    status: string
    payment_method: string
    payment_status: string
    total: number | string
  },
): number {
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

  const paymentCurrency = payment.currency?.trim().toUpperCase()
  const sessionCurrency = session.currency?.trim().toUpperCase()
  if (!paymentCurrency || paymentCurrency !== 'EGP' || sessionCurrency !== paymentCurrency) {
    throw new Error('XPAY_CURRENCY_MISMATCH')
  }

  if (typeof session.amountTotal !== 'number' || !Number.isSafeInteger(session.amountTotal)) {
    throw new Error('XPAY_AMOUNT_MISMATCH')
  }

  const paymentAmountMinor = egpToMinorUnits(payment.amount)
  const orderAmountMinor = egpToMinorUnits(order.total)
  if (
    paymentAmountMinor <= 0 ||
    paymentAmountMinor !== orderAmountMinor ||
    session.amountTotal !== paymentAmountMinor
  ) {
    throw new Error('XPAY_AMOUNT_MISMATCH')
  }

  return paymentAmountMinor
}

export function assertPaymentCanBeMarkedSuccessful(
  paymentStatus: string,
  orderStatus: string,
  orderPaymentStatus: string,
): void {
  if (paymentStatus !== orderPaymentStatus) {
    throw new Error('XPAY_PAYMENT_STATE_MISMATCH')
  }
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

export async function verifyXPaySignatureWithSecrets(
  rawBody: string,
  header: string | null | undefined,
  secrets: string[],
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ valid: true; event: XPayEvent } | { valid: false; reason: string }> {
  if (!header) return { valid: false, reason: 'missing_header' }
  if (!secrets.length) return { valid: false, reason: 'missing_secret' }

  let lastReason = 'bad_signature'
  for (const secret of secrets) {
    const result = await verifyXPaySignature(rawBody, header, secret, nowSeconds)
    if (result.valid) return result
    lastReason = result.reason
    if (result.reason === 'malformed_header' || result.reason === 'timestamp_out_of_tolerance') {
      return result
    }
  }
  return { valid: false, reason: lastReason }
}

export async function createCheckoutSession(input: {
  secretKey: string
  mode: XPayMode
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

  const payload: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new XPayUpstreamError(
      parseXPayUpstreamError(res.status, payload, [input.customerName ?? '', input.customerPhone ?? '']),
    )
  }

  const session = payload as XPayCheckoutSession | null
  if (!session?.id || !session.url) {
    throw new Error('XPAY_SESSION_INVALID_RESPONSE')
  }
  assertSessionMatchesMode(input.mode, session)
  return session
}

export async function retrieveCheckoutSession(
  secretKey: string,
  sessionId: string,
  mode?: XPayMode,
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
  const session = payload as XPayCheckoutSession
  if (mode) {
    assertSessionMatchesMode(mode, session)
  }
  return session
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
