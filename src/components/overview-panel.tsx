import { createClient } from '@/lib/supabase/server'
import { serverNow } from '@/lib/now'
import { formatDateShort, formatDateLong, formatDateTime } from '@/lib/format-date'
import { TtxbInventoryBox } from '@/components/ttxb-inventory-box'

const RECEIVED_CATEGORY_ORDER = [
  { code: 'LIQUIDATION', label: 'Liquidation' },
  { code: 'REPACK', label: 'Repack' },
  { code: 'STAGING', label: 'Staging' },
  { code: 'TICKET_CREATION', label: 'Ticket Creation' },
  { code: 'INVESTIGATION', label: 'Investigation' },
] as const

type ParcelRow = {
  tid: string
  parcel_category: string | null
  current_stage: string
  effective_value: number | null
  pallet_id: number | null
  batch_id: number | null
  sack: { area: string } | null
}

type StageEventRow = {
  stage: string
  event_ts: string
  scanned_by: string | null
  parcel: { parcel_category: string | null } | null
}
type SackEventRow = { action: string; event_ts: string; scanned_by: string | null; sack: { area: string } | null }
type PalletEventRow = { action: string; event_ts: string; scanned_by: string | null }

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

function gmvOf(rows: ParcelRow[]) {
  return rows.reduce((sum, p) => sum + (Number(p.effective_value) || 0), 0)
}

function dayKey(iso: string) {
  // Bucket by the SGT calendar day, not the raw UTC date.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

export async function OverviewPanel() {
  const supabase = await createClient()
  const now = serverNow()
  const nowDate = new Date(now)
  const sevenDayStart = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const mtdStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1))
  const earliestNeeded = new Date(Math.min(sevenDayStart.getTime(), mtdStart.getTime()))
  const todayStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()))
  const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000)
  // Week-to-date (Productivity) means "since Monday this week", distinct from the
  // rolling last-7-days window the rest of the page uses for "this week".
  const dayOfWeek = nowDate.getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const weekToDateStart = new Date(
    Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() - daysSinceMonday)
  )

  const [
    { data: parcels },
    { data: events },
    { data: sackEvents },
    { data: palletEvents },
    { data: stuckAtFirstScan },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('parcel')
      .select('tid, parcel_category, current_stage, effective_value, pallet_id, batch_id, sack:sack_id(area)'),
    supabase
      .from('stage_event')
      .select('stage, event_ts, scanned_by, parcel(parcel_category)')
      .in('stage', ['RECEIVED', 'IN_STORAGE', 'IN_LIQUIDATION_AREA', 'REPACKED'])
      .gte('event_ts', earliestNeeded.toISOString()),
    supabase
      .from('sack_event')
      .select('action, event_ts, scanned_by, sack:sack_id(area)')
      .eq('action', 'STRIPPED')
      .gte('event_ts', earliestNeeded.toISOString()),
    supabase
      .from('pallet_event')
      .select('action, event_ts, scanned_by')
      .in('action', ['SACK_ADDED', 'TID_ADDED', 'ENDORSED', 'OUTGOING'])
      .gte('event_ts', earliestNeeded.toISOString()),
    supabase
      .from('parcel')
      .select('tid, received_at')
      .eq('current_stage', 'RECEIVED')
      .order('received_at', { ascending: true }),
    supabase.from('profile').select('id, email'),
  ])

  const parcelRows = (parcels ?? []) as unknown as ParcelRow[]
  const eventRows = (events ?? []) as unknown as StageEventRow[]
  const sackEventRows = (sackEvents ?? []) as unknown as SackEventRow[]
  const palletEventRows = (palletEvents ?? []) as unknown as PalletEventRow[]
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]))

  function countSince(rows: { event_ts: string }[], start: Date) {
    return rows.filter((r) => new Date(r.event_ts).getTime() >= start.getTime()).length
  }

  function activityRows(key: string) {
    switch (key) {
      case 'first_scan':
        return eventRows.filter((e) => e.stage === 'RECEIVED')
      case 'inbound_storage':
        return eventRows.filter((e) => e.stage === 'IN_STORAGE')
      case 'repack':
        return eventRows.filter((e) => e.stage === 'REPACKED')
      case 'new_arrival':
        return eventRows.filter((e) => e.stage === 'IN_LIQUIDATION_AREA')
      case 'strip_storage':
        return sackEventRows.filter((e) => e.sack?.area === 'STORAGE')
      case 'strip_liquidation':
        return sackEventRows.filter((e) => e.sack?.area === 'LIQUIDATION')
      case 'consolidate_pallet':
        return palletEventRows.filter((e) => e.action === 'SACK_ADDED' || e.action === 'TID_ADDED')
      case 'endorsement':
        return palletEventRows.filter((e) => e.action === 'ENDORSED')
      case 'outbound':
        return palletEventRows.filter((e) => e.action === 'OUTGOING')
      default:
        return []
    }
  }

  const activityCounts = ACTIVITIES.map((a) => {
    const rows = activityRows(a.key)
    return { ...a, today: countSince(rows, todayStart), week: countSince(rows, sevenDayStart) }
  })

  // Productivity: same 9 activities, grouped by who scanned them, across three windows.
  const accountEmails = Array.from(new Set([...emailById.values()])).filter((e): e is string => !!e)
  const productivity = accountEmails.map((email) => {
    const accountId = [...emailById.entries()].find(([, e]) => e === email)?.[0]
    const byActivity = ACTIVITIES.map((a) => {
      const rows = activityRows(a.key).filter((r) => r.scanned_by === accountId)
      return {
        key: a.key,
        label: a.label,
        today: countSince(rows, todayStart),
        week: countSince(rows, weekToDateStart),
        month: countSince(rows, mtdStart),
      }
    })
    return {
      email,
      todayTotal: byActivity.reduce((s, a) => s + a.today, 0),
      weekTotal: byActivity.reduce((s, a) => s + a.week, 0),
      monthTotal: byActivity.reduce((s, a) => s + a.month, 0),
      byActivity,
    }
  })

  // Inventory = net position, derived straight from current_stage/facilityFor rather
  // than subtracting cumulative scan counts — sack-level scans (4/6) can't be turned
  // into a parcel count without double-counting, and current_stage already reflects
  // exactly "inbounded minus outbounded" by construction (a parcel only ever holds one
  // stage). Storage-side, once stripped a parcel has left Storage regardless of
  // whether it's reached a pallet yet — it just isn't in either bucket for that window.
  const ttxbStorageParcels = parcelRows.filter((p) => p.current_stage === 'IN_STORAGE')
  const liquidationParcels = parcelRows.filter((p) => facilityFor(p) === 'Liquidation Area')
  const liquidationSoldParcels = liquidationParcels.filter((p) => p.current_stage === 'SOLD')
  const liquidationNotSoldParcels = liquidationParcels.filter((p) => p.current_stage !== 'SOLD')

  // TTXB drill-down: 7-day daily entry counts (from the stage_event window we already
  // fetched, which always covers at least the last 7 days) plus a backlog count that
  // needs an unbounded lookback — a parcel stuck for 60 days wouldn't show up in a
  // 7-30-day window, so this is a dedicated, separately-scoped query.
  const ttxbEntryEvents = eventRows.filter((e) => e.stage === 'IN_STORAGE')
  const dayBuckets: { key: string; daysAgo: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000)
    dayBuckets.push({ key: dayKey(d.toISOString()), daysAgo: i })
  }
  const dailyEntryMap = new Map<string, number>(dayBuckets.map((b) => [b.key, 0]))
  for (const e of ttxbEntryEvents) {
    const k = dayKey(e.event_ts)
    if (dailyEntryMap.has(k)) dailyEntryMap.set(k, (dailyEntryMap.get(k) ?? 0) + 1)
  }
  const ttxbDailyEntries = dayBuckets.map(({ key, daysAgo }) => ({
    date: formatDateShort(new Date(`${key}T00:00:00`)),
    daysAgo,
    count: dailyEntryMap.get(key) ?? 0,
  }))

  const ttxbStorageTids = ttxbStorageParcels.map((p) => p.tid)
  const { data: ttxbEntryForBacklog } = ttxbStorageTids.length
    ? await supabase
        .from('stage_event')
        .select('tid, event_ts')
        .eq('stage', 'IN_STORAGE')
        .in('tid', ttxbStorageTids)
    : { data: [] }
  const earliestEntryByTid = new Map<string, string>()
  for (const e of ttxbEntryForBacklog ?? []) {
    const existing = earliestEntryByTid.get(e.tid)
    if (!existing || new Date(e.event_ts) < new Date(existing)) earliestEntryByTid.set(e.tid, e.event_ts)
  }
  const ttxbBacklogCount = Array.from(earliestEntryByTid.values()).filter(
    (ts) => new Date(ts).getTime() < eightDaysAgo.getTime()
  ).length

  // Liquidation-area aging: "entered the area" is a direct scan (Scan 5) for
  // non-TTXB parcels, but TTXB parcels arriving via pallet consolidation skip that
  // scan entirely — for those, the pallet's assembled_at (set when the first sack/TID
  // lands on it) is the best available proxy for when the parcel reached the area.
  const liquidationTids = liquidationParcels.map((p) => p.tid)
  const { data: liqEntryEvents } = liquidationTids.length
    ? await supabase
        .from('stage_event')
        .select('tid, event_ts')
        .eq('stage', 'IN_LIQUIDATION_AREA')
        .in('tid', liquidationTids)
    : { data: [] }
  const liqEntryByTid = new Map<string, string>()
  for (const e of liqEntryEvents ?? []) {
    const existing = liqEntryByTid.get(e.tid)
    if (!existing || new Date(e.event_ts) < new Date(existing)) liqEntryByTid.set(e.tid, e.event_ts)
  }

  const palletIdsForAging = Array.from(
    new Set(liquidationParcels.map((p) => p.pallet_id).filter((id): id is number => id != null))
  )
  const { data: palletsForAging } = palletIdsForAging.length
    ? await supabase.from('pallet').select('pallet_id, assembled_at').in('pallet_id', palletIdsForAging)
    : { data: [] }
  const assembledAtByPallet = new Map((palletsForAging ?? []).map((p) => [p.pallet_id, p.assembled_at]))

  const batchIdsForAging = Array.from(
    new Set(liquidationSoldParcels.map((p) => p.batch_id).filter((id): id is number => id != null))
  )
  const { data: salesForAging } = batchIdsForAging.length
    ? await supabase.from('sale').select('batch_id, sale_date').in('batch_id', batchIdsForAging)
    : { data: [] }
  const saleDateByBatch = new Map((salesForAging ?? []).map((s) => [s.batch_id, s.sale_date]))

  function liquidationEntryTs(p: ParcelRow): string | null {
    return liqEntryByTid.get(p.tid) ?? (p.pallet_id != null ? (assembledAtByPallet.get(p.pallet_id) ?? null) : null)
  }

  const notSoldAges = liquidationNotSoldParcels
    .map((p) => liquidationEntryTs(p))
    .filter((ts): ts is string => ts != null)
    .map((ts) => (now - new Date(ts).getTime()) / (24 * 60 * 60 * 1000))
  const avgNotSoldAgeDays = notSoldAges.length ? notSoldAges.reduce((s, d) => s + d, 0) / notSoldAges.length : null
  const oldestNotSoldAgeDays = notSoldAges.length ? Math.max(...notSoldAges) : null

  const timeToSaleDays = liquidationSoldParcels
    .map((p) => {
      const entryTs = liquidationEntryTs(p)
      const saleDate = p.batch_id != null ? saleDateByBatch.get(p.batch_id) : null
      if (!entryTs || !saleDate) return null
      return (new Date(saleDate).getTime() - new Date(entryTs).getTime()) / (24 * 60 * 60 * 1000)
    })
    .filter((d): d is number => d != null)
  const avgTimeToSaleDays = timeToSaleDays.length
    ? timeToSaleDays.reduce((s, d) => s + d, 0) / timeToSaleDays.length
    : null

  const facilityCounts = new Map<string, number>()
  for (const p of parcelRows) {
    const f = facilityFor(p)
    facilityCounts.set(f, (facilityCounts.get(f) ?? 0) + 1)
  }

  function receivedCountsSince(start: Date) {
    const inWindow = eventRows.filter((e) => e.stage === 'RECEIVED' && new Date(e.event_ts).getTime() >= start.getTime())
    const byCategory = RECEIVED_CATEGORY_ORDER.map(({ code, label }) => ({
      code,
      label,
      count: inWindow.filter((e) => e.parcel?.parcel_category === code).length,
    }))
    return { total: inWindow.length, byCategory }
  }

  const today = receivedCountsSince(todayStart)
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
        <TtxbInventoryBox
          count={ttxbStorageParcels.length}
          gmv={gmvOf(ttxbStorageParcels)}
          dailyEntries={ttxbDailyEntries}
          backlogCount={ttxbBacklogCount}
        />
        <div className="rounded-md border-2 border-green-300 bg-green-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-wide text-green-800">
            Inventory — Liquidation Area
          </div>
          <div className="text-6xl font-black text-green-900">{liquidationParcels.length}</div>
          <div className="text-xl font-semibold text-green-800">
            GMV ₱{gmvOf(liquidationParcels).toLocaleString()}
          </div>
          <div className="mt-2 flex flex-col gap-1 text-sm text-green-900">
            <div>
              Not sold: {liquidationNotSoldParcels.length} · GMV ₱{gmvOf(liquidationNotSoldParcels).toLocaleString()}
            </div>
            <div>
              Sold: {liquidationSoldParcels.length} · GMV ₱{gmvOf(liquidationSoldParcels).toLocaleString()}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-md border border-green-200 bg-white p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-green-800">
              Aging — entry to sale (target 4–6 weeks)
            </h4>
            <div className="flex flex-col gap-1 text-sm text-neutral-700">
              <div>
                Not-sold avg age:{' '}
                <span className="font-semibold">
                  {avgNotSoldAgeDays != null ? `${avgNotSoldAgeDays.toFixed(0)} days` : '—'}
                </span>
                {' · oldest: '}
                <span className="font-semibold">
                  {oldestNotSoldAgeDays != null ? `${oldestNotSoldAgeDays.toFixed(0)} days` : '—'}
                </span>
              </div>
              <div
                className={`w-fit rounded-md px-2 py-1 font-semibold ${
                  avgTimeToSaleDays != null && avgTimeToSaleDays > 42
                    ? 'bg-red-100 text-red-800'
                    : 'bg-green-100 text-green-800'
                }`}
              >
                Avg time to sale: {avgTimeToSaleDays != null ? `${avgTimeToSaleDays.toFixed(0)} days` : 'No sales yet'}
              </div>
            </div>
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
          Productivity — scans by account
        </h3>
        <p className="text-xs text-neutral-500">
          Today / week-to-date / month-to-date totals, then a breakdown by scan type per account.
        </p>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Account</th>
              <th className="py-2 pr-4">Today</th>
              <th className="py-2 pr-4">WTD</th>
              <th className="py-2">MTD</th>
            </tr>
          </thead>
          <tbody>
            {productivity.map((p) => (
              <tr key={p.email} className="border-b border-neutral-100">
                <td className="py-2 pr-4">{p.email}</td>
                <td className="py-2 pr-4 font-medium">{p.todayTotal}</td>
                <td className="py-2 pr-4 font-medium">{p.weekTotal}</td>
                <td className="py-2 font-medium">{p.monthTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {productivity.length === 0 && <p className="text-sm text-neutral-400">No accounts found.</p>}

        {productivity.map((p) => (
          <div key={p.email} className="mt-2 flex flex-col gap-1">
            <h4 className="text-xs font-semibold text-neutral-700">{p.email} — by scan type</h4>
            <table className="w-full max-w-2xl text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 uppercase tracking-wide text-neutral-500">
                  <th className="py-1.5 pr-4">Scan</th>
                  <th className="py-1.5 pr-4">Today</th>
                  <th className="py-1.5 pr-4">WTD</th>
                  <th className="py-1.5">MTD</th>
                </tr>
              </thead>
              <tbody>
                {p.byActivity
                  .filter((a) => a.month > 0)
                  .map((a) => (
                    <tr key={a.key} className="border-b border-neutral-100">
                      <td className="py-1.5 pr-4">{a.label}</td>
                      <td className="py-1.5 pr-4">{a.today}</td>
                      <td className="py-1.5 pr-4">{a.week}</td>
                      <td className="py-1.5">{a.month}</td>
                    </tr>
                  ))}
                {p.byActivity.every((a) => a.month === 0) && (
                  <tr>
                    <td colSpan={4} className="py-1.5 text-neutral-400">
                      No scans this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
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
