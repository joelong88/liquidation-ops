// Liveness/readiness probe required by the deploy contract (GET /health on 8000).
// Kept dependency-free on purpose: it must answer 200 even when Supabase is down,
// otherwise the platform will restart a container that is actually serving fine.
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ status: 'ok' })
}
