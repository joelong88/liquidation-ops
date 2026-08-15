import { requireOpsRole } from '@/lib/ops/api-helpers'
import { recordPalletSale } from '@/lib/ops/sale'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const palletIds = Array.isArray(body.pallet_ids) ? body.pallet_ids.map(Number) : []
  const result = await recordPalletSale(
    auth.email,
    palletIds,
    String(body.buyer_name),
    Number(body.sale_amount),
    body.batch_id != null ? Number(body.batch_id) : null,
    body.sale_date ?? null
  )
  return Response.json(result)
}
