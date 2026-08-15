import { requireOpsRole } from '@/lib/ops/api-helpers'
import { stripSack } from '@/lib/ops/sack-lifecycle'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const result = await stripSack(auth.email, String(body.sack_code), body.area, body.station ?? null)
  return Response.json(result)
}
