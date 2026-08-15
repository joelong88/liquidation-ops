import { requireOpsRole } from '@/lib/ops/api-helpers'
import { recordBatchSale } from '@/lib/ops/sale'

export async function POST(request: Request) {
  const auth = await requireOpsRole(['recovery_team', 'finance_team', 'owner'])
  if (!auth.ok) return auth.response

  const body = await request.json()
  const result = await recordBatchSale(
    auth.email,
    Number(body.batch_id),
    String(body.buyer_name),
    Number(body.sale_amount),
    body.sale_date ?? null
  )
  return Response.json(result)
}
