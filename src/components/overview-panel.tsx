import { createClient } from '@/lib/supabase/server'
import { serverNow } from '@/lib/now'
import { formatDateShort, formatDateLong, formatDateTime } from '@/lib/format-date'

const RECEIVED_CATEGORY_ORDER = [
  { code: 'LIQUIDATION', label: 'Liquidation' },
  { code: 'REPACK', label: 'Repack' },
  { code: 'STAGING', label: 'Staging' },
  { code: 'TICKET_CREATION', label: 'Ticket Creation' },
  { code: 'INVESTIGATION', label: 'Investigation' },
] as const

type ParcelRow = {
  parcel_category: string | null
  current_stage: string
  sack: { area: string } | null
}

type StageEventRow = { stage: string; event_ts: string; parcel: { parcel_category: string | null } | null }

type ActivityDef = {
  key: string
  label: string
  grain: 'parcels' | 'sacks' | 'pallets'
}

const ACTIVITIES: ActivityDef[] = [
  { key: 'first_scan', label: '1. First Scan', grain: 'parcels' },
  { key: 'inbound_storage', label: '2. Inbound → TTXB Storage', grain: 'parcels' },
  { key: 'repack', label: '3. Repack (TTXB Storage)', grain: 'parcels' },
  { key: 'strip_storage', label: '4. Strip (TTXB Storage)', grain: 'sacks' },
  { key: 'new_arrival', label: '5. New Arrival (Liquidation Area)', grain: 'parcels' },
  { key: 'consolidate_pallet', label: 'Consolidate onto Pallet', grain: 'sacks' },
  { key: 'strip_liquidation', label: '6. Strip (Liquidation Area)', grain: 'sacks' },
  { key: 'endorsement', label: '7. Endorsement', grain: 'pallets' },
  { key: 'outbound', label: '8. Outbound (Liquidation Area)', grain: 'pallets' },
]

// Confirmed with Joel: Scan 4 (strip from Storage) alone doesn't move a parcel into
// the Liquidation Area — it only leaves Storage. The move into the Liquidation Area
// only completes once the stripped sack is actually consolidated onto a pallet
// (ON_PALLET+). So a STRIPPED sack from Storage sits in a third, in-between bucket.
// A STRIPPED sack that originated in the Liquidation Area (Scan 6) never physically
// left it, so it stays counted there the whole time.
function facilityFor(p: ParcelRow): string {
  if (p.current_stage === 'IN_STORAGE') return 'TTXB Storage Area'
  if (p.current_stage === 'STRIPPED') {
    return p.sack?.area === 'STORAGE' ? 'Awaiting pallet consolidation (ex-Storage)' : 'Liquidation Area'
  }
  if (['IN_LIQUIDATION_AREA', 'ON_PALLET', 'ENDORSED', 'SOLD'].includes(p.current_stage)) {
    return 'Liquidation Area'
  }
  if (p.current_stage === 'RECEIVED') return 'Not yet placed (post First Scan)'
  if (p.current_stage === 'REPACKED') return 'Repacked (exited)'
  if (p.current_stage === 'OUTGOING') return 'Shipped out'
  return p.current_stage
}

export async function OverviewPanel() {
  const supabase = await createClient()
  const now = serverNow()
  const nowDate = new Date(now)
  const sevenDayStart = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const mtdStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1))
  const earliestNeeded = new Date(Math.min(sevenDayStart.getTime(), mtdStart.getTime()))

  const [{ data: parcels }, { data: events }, { data: sackEvents }, { data: palletEvents }, { data: stuckAtFirstScan }] =
    await Promise.all([
      supabase.from('parcel').select('parcel_category, current_stage, sack:sack_id(area)'),
      supabase
        .from('stage_event')
        .select('stage, event_ts, parcel(parcel_category)')
        .in('stage', ['RECEIVED', 'IN_STORAGE', 'IN_LIQUIDATION_AREA', 'REPACKED'])
        .gte('event_ts', earliestNeeded.toISOString()),
      supabase
        .from('sack_event')
        .select('action, event_ts, sack:sack_id(area)')
        .eq('action', 'STRIPPED')
        .gte('event_ts', sevenDayStart.toISOString()),
      supabase
        .from('pallet_event')
        .select('action, event_ts')
        .in('action', ['SACK_ADDED', 'TID_ADDED', 'ENDORSED', 'OUTGOING'])
        .gte('event_ts', sevenDayStart.toISOString()),
      supabase
        .from('parcel')
        .select('tid, received_at')
        .eq('current_stage', 'RECEIVED')
        .order('received_at', { ascending: true }),
    ])

  const parcelRows = (parcels ?? []) as unknown as ParcelRow[]
  const eventRows = (events ?? []) as unknown as StageEventRow[]
  const sackEventRows = (sackEvents ?? []) as unknown as { action: string; event_ts: string; sack: { area: string } | null }[]
  const palletEventRows = (palletEvents ?? []) as unknown as { action: string; event_ts: string }[]

  const todayStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()))

  function countSince(rows: { event_ts: string }[], start: Date) {
    return rows.filter((r) => new Date(r.event_ts).getTime() >= start.getTime()).length
  }

  const activityCounts = ACTIVITIES.map((a) => {
    let rows: { event_ts: string }[]
    switch (a.key) {
      case 'first_scan':
        rows = eventRows.filter((e) => e.stage === 'RECEIVED')
        break
      case 'inbound_storage':
        rows = eventRows.filter((e) => e.stage === 'IN_STORAGE')
        break
      case 'repack':
        rows = eventRows.filter((e) => e.stage === 'REPACKED')
        break
      case 'new_arrival':
        rows = eventRows.filter((e) => e.stage === 'IN_LIQUIDATION_AREA')
        break
      case 'strip_storage':
        rows = sackEventRows.filter((e) => e.sack?.area === 'STORAGE')
        break
      case 'strip_liquidation':
        rows = sackEventRows.filter((e) => e.sack?.area === 'LIQUIDATION')
        break
      case 'consolidate_pallet':
        rows = palletEventRows.filter((e) => e.action === 'SACK_ADDED' || e.action === 'TID_ADDED')
        break
      case 'endorsement':
        rows = palletEventRows.filter((e) => e.action === 'ENDORSED')
        break
      case 'outbound':
        rows = palletEventRows.filter((e) => e.action === 'OUTGOING')
        break
      default:
        rows = []
    }
    return {
      ...a,
      today: countSince(rows, todayStart),
      week: countSince(rows, sevenDayStart),
    }
  })

  // Inventory = net position, derived straight from current_stage/facilityFor rather
  // than subtracting cumulative scan counts — sack-level scans (4/6) can't be turned
  // into a parcel count without double-counting, and current_stage already reflects
  // exactly "inbounded minus outbounded" by construction (a parcel only ever holds one
  // stage). Storage-side, once stripped a parcel has left Storage regardless of
  // whether it's reached a pallet yet — it just isn't in either bucket for that window.
  const ttxbStorageInventory = parcelRows.filter((p) => p.current_stage === 'IN_STORAGE').length
  const liquidationAreaInventory = parcelRows.filter((p) => facilityFor(p) === 'Liquidation Area').length

  const facilityCounts = new Map<string, number>()
  for (const p of parcelRows) {
    const f = facilityFor(p)
    facilityCounts.set(f, (facilityCounts.get(f) ?? 0) + 1)
  }

  function receivedCountsSince(start: Date) {
    const inWindow = eventRows.filter((e) => new Date(e.event_ts).getTime() >= start.getTime())
    const byCategory = RECEIVED_CATEGORY_ORDER.map(({ code, label }) => ({
      code,
      label,
      count: inWindow.filter((e) => e.parcel?.parcel_category === code).length,
    }))
    return { total: inWindow.length, byCategory }
  }

  const today = receivedCountsSince(new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate())))
  const last7 = receivedCountsSince(sevenDayStart)
  const mtd = receivedCountsSince(mtdStart)

  const todayLabel = formatDateLong(nowDate)
  const last7Label = `Last 7 days (${formatDateShort(sevenDayStart)} – ${formatDateShort(nowDate)})`
  const mtdLabel = `Month to date (${formatDateShort(mtdStart)} – ${formatDateShort(nowDate)})`

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Overview</h2>
        <p className="text-sm text-neutral-500">
          Live inventory by area, facility breakdown, activity counts across Scans 1–9, and
          First-Scan counts today / last 7 days / month to date.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border-2 border-blue-300 bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            Inventory — TTXB Storage Area
          </div>
          <div className="text-4xl font-black text-blue-900">{ttxbStorageInventory}</div>
          <div className="text-xs text-blue-800/70">TIDs inbounded (Scan 2), not yet repacked or stripped</div>
        </div>
        <div className="rounded-md border-2 border-green-300 bg-green-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Inventory — Liquidation Area
          </div>
          <div className="text-4xl font-black text-green-900">{liquidationAreaInventory}</div>
          <div className="text-xs text-green-800/70">
            TIDs consolidated onto a pallet from Storage (Scan 4) or arrived direct (Scan 5), not yet Outbound
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Stuck at First Scan ({stuckAtFirstScan?.length ?? 0}) — not yet fully processed
        </h3>
        <p className="text-xs text-neutral-500">
          TIDs whose last scan was First Scan (Scan 1) — they haven&apos;t yet been inbounded into
          either area.
        </p>
        <ul className="max-h-48 max-w-md overflow-y-auto rounded-md border border-neutral-200 text-xs">
          {(stuckAtFirstScan ?? []).map((p) => (
            <li
              key={p.tid}
              className="flex items-center justify-between border-b border-neutral-100 px-3 py-1.5 last:border-b-0"
            >
              <span className="font-mono">{p.tid}</span>
              <span className="text-neutral-500">
                {p.received_at ? formatDateTime(p.received_at) : '—'}
              </span>
            </li>
          ))}
          {(stuckAtFirstScan ?? []).length === 0 && (
            <li className="px-3 py-1.5 text-neutral-400">None — everything has moved past First Scan.</li>
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Activity today / this week (Scans 1–9)
        </h3>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Station</th>
              <th className="py-2 pr-4">Grain</th>
              <th className="py-2 pr-4">Today</th>
              <th className="py-2">This week</th>
            </tr>
          </thead>
          <tbody>
            {activityCounts.map((a) => (
              <tr key={a.key} className="border-b border-neutral-100">
                <td className="py-2 pr-4">{a.label}</td>
                <td className="py-2 pr-4 text-neutral-500">{a.grain}</td>
                <td className="py-2 pr-4 font-medium">{a.today}</td>
                <td className="py-2 font-medium">{a.week}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Where everything currently is
        </h3>
        <table className="w-full max-w-md text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Facility / stage</th>
              <th className="py-2">Parcels</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(facilityCounts.entries()).map(([facility, count]) => (
              <tr key={facility} className="border-b border-neutral-100">
                <td className="py-2 pr-4">{facility}</td>
                <td className="py-2 font-medium">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {facilityCounts.size === 0 && (
          <p className="text-sm text-neutral-400">No parcels in the system yet.</p>
        )}
      </section>

      {[
        { label: todayLabel, data: today },
        { label: last7Label, data: last7 },
        { label: mtdLabel, data: mtd },
      ].map(({ label, data }) => (
        <section key={label} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
          <table className="w-full max-w-md text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Category (First Scan)</th>
                <th className="py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-medium">Total</td>
                <td className="py-2 font-medium">{data.total}</td>
              </tr>
              {data.byCategory.map((c) => (
                <tr key={c.code} className="border-b border-neutral-100 text-neutral-600">
                  <td className="py-1.5 pl-4 pr-4">{c.label}</td>
                  <td className="py-1.5">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
