import { requireOpsRole } from '@/lib/ops/api-helpers'
import { recordPalletOutbound } from '@/lib/ops/pallet-lifecycle'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const result = await recordPalletOutbound(auth.email, String(body.pallet_code), body.station ?? null)
  return Response.json(result)
}
