// GET /health — the platform's readiness probe. Must stay unauthenticated and
// uncached, so it is excluded from the proxy matcher in src/proxy.ts.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' })
}
