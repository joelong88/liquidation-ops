import { requireOpsRole } from '@/lib/ops/api-helpers'
import { assignPallet } from '@/lib/ops/pallet-lifecycle'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const result = await assignPallet(
    auth.email,
    auth.role,
    String(body.pallet_code),
    Array.isArray(body.sack_codes) ? body.sack_codes.map(String) : [],
    Array.isArray(body.tids) ? body.tids.map(String) : []
  )
  return Response.json(result)
}
