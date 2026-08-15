import { requireOpsRole } from '@/lib/ops/api-helpers'
import { query } from '@/lib/db/mysql'

// Live per-sack parcel count shown on the area-inbound station while a sack is
// still open — read-only equivalent of the two direct Supabase queries
// area-inbound-form.tsx used to make itself.
export async function GET(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const code = new URL(request.url).searchParams.get('code')
  if (!code) return Response.json({ sack_id: null, tid_count: null })

  const sackRows = await query<{ sack_id: number }>(
    "select sack_id from sack where sack_code = ? and status = 'OPEN'",
    [code]
  )
  const sack = sackRows[0]
  if (!sack) return Response.json({ sack_id: null, tid_count: null })

  const countRows = await query<{ count: number }>('select count(*) as count from parcel where sack_id = ?', [
    sack.sack_id,
  ])

  return Response.json({ sack_id: sack.sack_id, tid_count: countRows[0]?.count ?? 0 })
}
