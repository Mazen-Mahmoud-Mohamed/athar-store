import { jsonResponse } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'
import { resolveXpayMode } from '../_shared/xpay.ts'
import { processWebhookClaim, rpcValue, type WebhookClaim } from '../_shared/xpayWebhookProcessor.ts'

// Scheduler/operator endpoint. No event or payment data is accepted from this request.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'method_not_allowed' }, 405)
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supplied = req.headers.get('Authorization') ?? ''
  if (!key) return jsonResponse(req, { error: 'unavailable' }, 503)
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const [expected, actual] = await Promise.all([digest(`Bearer ${key}`), digest(supplied)])
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i]
  if (difference !== 0) return jsonResponse(req, { error: 'unauthorized' }, 401)
  try {
    const mode = resolveXpayMode(Deno.env.get('XPAY_MODE'))
    const supabase = createServiceClient()
    let processed = 0, failed = 0
    for (let i = 0; i < 10; i++) {
      const { data, error } = await supabase.rpc('claim_xpay_webhook_event', { p_event_id: null })
      if (error) return jsonResponse(req, { error: 'claim_failed', processed, failed }, 503)
      const claim = rpcValue(data, 'claim_xpay_webhook_event') as WebhookClaim | null
      if (!claim) break
      const response = await processWebhookClaim(req, supabase, claim, mode)
      if (response.ok) processed++
      else failed++
    }
    const { data: status, error: statusError } = await supabase.rpc('xpay_webhook_queue_status', {})
    if (statusError) return jsonResponse(req, { error: 'status_failed', processed, failed }, 503)
    return jsonResponse(req, { processed, failed, queue: rpcValue(status, 'xpay_webhook_queue_status') }, failed ? 503 : 200)
  } catch {
    return jsonResponse(req, { error: 'unavailable' }, 503)
  }
})
