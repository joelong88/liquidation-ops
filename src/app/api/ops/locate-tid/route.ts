import { requireOpsRole } from '@/lib/ops/api-helpers'
import { query } from '@/lib/db/mysql'

// "Find a parcel" lookup on Recent Scans (shipper pull-out requests etc.) —
// read-only equivalent of tid-location-checker.tsx's original embedded-join query.
export async function GET(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const tid = new URL(request.url).searchParams.get('tid')
  if (!tid) return Response.json({ ok: false, error: 'missing_tid' }, { status: 400 })

  const rows = await query<{
    tid: string
    current_stage: string
    resolved_output_bin: string | null
    sack_code: string | null
    sack_area: string | null
    sack_status: string | null
    pallet_code: string | null
    pallet_status: string | null
  }>(
    `select p.tid, p.current_stage, p.resolved_output_bin,
            s.sack_code, s.area as sack_area, s.status as sack_status,
            pl.pallet_code, pl.status as pallet_status
       from parcel p
       left join sack s on s.sack_id = p.sack_id
       left join pallet pl on pl.pallet_id = p.pallet_id
      where p.tid = ?`,
    [tid]
  )

  const parcel = rows[0]
  if (!parcel) return Response.json({ ok: false, error: 'not_found' })

  return Response.json({ ok: true, ...parcel })
}
