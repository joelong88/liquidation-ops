import { requireOpsRole } from '@/lib/ops/api-helpers'
import { query } from '@/lib/db/mysql'

// Strip & Consolidate's lookup-before-confirm step — read-only, mirrors
// strip-and-consolidate-form.tsx's original two direct Supabase queries (sack
// status check, then its member TIDs).
export async function GET(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const area = url.searchParams.get('area')
  if (!code || (area !== 'STORAGE' && area !== 'LIQUIDATION')) {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const sackRows = await query<{ sack_id: number; status: string }>(
    'select sack_id, status from sack where sack_code = ? and area = ? order by created_at desc limit 1',
    [code, area]
  )
  const sack = sackRows[0]
  if (!sack) return Response.json({ ok: false, error: 'not_found' })
  if (sack.status === 'OPEN') return Response.json({ ok: false, error: 'still_open' })
  if (!['CLOSED', 'STRIPPED'].includes(sack.status)) {
    return Response.json({ ok: false, error: 'wrong_status', status: sack.status })
  }

  const parcelRows = await query<{ tid: string }>('select tid from parcel where sack_id = ? order by tid', [
    sack.sack_id,
  ])

  return Response.json({
    ok: true,
    sack_code: code,
    tids: parcelRows.map((p) => p.tid),
    already_stripped: sack.status === 'STRIPPED',
  })
}
