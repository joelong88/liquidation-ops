import { requireOpsRole } from '@/lib/ops/api-helpers'
import { query } from '@/lib/db/mysql'
import { serverNow } from '@/lib/now'

type ClosedSack = { sack_id: number; sack_code: string; closed_at: string; tid_count: number }

// Sacks closed today in a given area, with a live TID count each — read-only
// equivalent of area-inbound-form.tsx's two direct Supabase queries. "Today" uses
// the same UTC-day boundary convention as the rest of the app (see
// overview-panel.tsx's todayStart), not a browser-local one.
export async function GET(request: Request) {
  const auth = await requireOpsRole(['warehouse_ops', 'recovery_team', 'owner'])
  if (!auth.ok) return auth.response

  const area = new URL(request.url).searchParams.get('area')
  if (area !== 'STORAGE' && area !== 'LIQUIDATION') {
    return Response.json({ ok: false, error: 'invalid_area' }, { status: 400 })
  }

  const now = new Date(serverNow())
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const events = await query<{ sack_id: number; sack_code: string; closed_at: string }>(
    `select se.sack_id, s.sack_code, se.event_ts as closed_at
       from sack_event se
       join sack s on s.sack_id = se.sack_id
      where se.action = 'CLOSED' and s.area = ? and se.event_ts >= ?
      order by se.event_ts desc`,
    [area, todayStart]
  )

  if (events.length === 0) return Response.json({ sacks: [] satisfies ClosedSack[] })

  const sackIds = events.map((e) => e.sack_id)
  const counts = await query<{ sack_id: number; count: number }>(
    `select sack_id, count(*) as count from parcel where sack_id in (?) group by sack_id`,
    [sackIds]
  )
  const countBySack = new Map(counts.map((c) => [c.sack_id, c.count]))

  const sacks: ClosedSack[] = events.map((e) => ({
    sack_id: e.sack_id,
    sack_code: e.sack_code,
    closed_at: e.closed_at,
    tid_count: countBySack.get(e.sack_id) ?? 0,
  }))

  return Response.json({ sacks })
}
