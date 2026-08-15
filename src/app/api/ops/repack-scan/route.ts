import { requireOpsRole } from '@/lib/ops/api-helpers'
import { repackScan } from '@/lib/ops/sack-lifecycle'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const result = await repackScan(auth.email, String(body.tid), body.station ?? null)
  return Response.json(result)
}
