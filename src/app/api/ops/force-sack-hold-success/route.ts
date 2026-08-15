import { requireOpsRole } from '@/lib/ops/api-helpers'
import { forceSackHoldSuccess } from '@/lib/ops/sack-lifecycle'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const result = await forceSackHoldSuccess(auth.email, String(body.sack_code), String(body.reason))
  return Response.json(result)
}
