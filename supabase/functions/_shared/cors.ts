const ALLOWED_ORIGINS = new Set([
  'https://athar.qd.je',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') ?? ''
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://athar.qd.je'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, xpay-signature',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  }
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export function textResponse(
  req: Request,
  body: string,
  status = 200,
): Response {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
