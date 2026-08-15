import { requireOpsRole } from '@/lib/ops/api-helpers'
import { recordFirstScan } from '@/lib/ops/first-scan'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const result = await recordFirstScan(auth.email, String(body.tid), body.parcel_category ?? null, body.station ?? null)
  return Response.json(result)
}
