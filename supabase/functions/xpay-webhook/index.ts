import { textResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'
import { assertSessionMatchesMode, collectWebhookSecrets, isRefundEventType,
  parseRefundEvent, resolveXpayMode, verifyXPaySignatureWithSecrets, type XPayCheckoutSession,
} from '../_shared/xpay.ts'
import { processWebhookClaim, rpcValue, type WebhookClaim } from '../_shared/xpayWebhookProcessor.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return textResponse(req, 'method_not_allowed', 405)
  try {
    const mode = resolveXpayMode(Deno.env.get('XPAY_MODE'))
    const secrets = collectWebhookSecrets({
      primary: Deno.env.get('XPAY_WEBHOOK_SECRET'),
      secondary: Deno.env.get('XPAY_WEBHOOK_SECRET_SECONDARY'),
    })
    const verified = await verifyXPaySignatureWithSecrets(await req.text(),
      req.headers.get('XPay-Signature'), secrets)
    if (!verified.valid) return textResponse(req, 'invalid_signature', 400)
    const event = verified.event
    // Validate mode before dedupe/storage, so a cross-mode event cannot poison an ID.
    try {
      if (isRefundEventType(event.type)) parseRefundEvent(mode, event)
      else assertSessionMatchesMode(mode, event.data?.object as XPayCheckoutSession | undefined)
    } catch {
      return textResponse(req, 'invalid_mode_or_contract', 400)
    }
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('queue_xpay_webhook_event', {
      p_event_id: event.id, p_event_type: event.type, p_mode: mode, p_payload: event,
    })
    if (error) return textResponse(req, 'queue_failed', 503)
    if (rpcValue(data, 'queue_xpay_webhook_event') === 'processed') return textResponse(req, 'ok', 200)
    // Signed delivery is already durable. 503 requests provider retries as an additional
    // recovery path; the authenticated worker also drains it without fresh signatures.
    const { data: claimed, error: claimError } = await supabase.rpc('claim_xpay_webhook_event', { p_event_id: event.id })
    if (claimError) return textResponse(req, 'queue_claim_failed', 503)
    const claim = rpcValue(claimed, 'claim_xpay_webhook_event') as WebhookClaim | null
    if (!claim) return textResponse(req, 'queued_retry', 503)
    return await processWebhookClaim(req, supabase, claim, mode)
  } catch {
    return textResponse(req, 'invalid_or_unavailable', 503)
  }
})
