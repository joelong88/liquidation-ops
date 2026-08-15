import { requireOpsRole } from '@/lib/ops/api-helpers'
import { endorsePalletsToAdmin } from '@/lib/ops/pallet-lifecycle'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const palletIds = Array.isArray(body.pallet_ids) ? body.pallet_ids.map(Number) : []
  const result = await endorsePalletsToAdmin(auth.email, palletIds)
  return Response.json(result)
}
