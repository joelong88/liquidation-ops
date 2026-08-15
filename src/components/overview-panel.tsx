import { query } from '@/lib/db/mysql'
import { serverNow } from '@/lib/now'
import { formatDateShort, formatDateLong, formatDateTime } from '@/lib/format-date'
import { TtxbInventoryBox } from '@/components/ttxb-inventory-box'
import { OverviewCanvas, Card, CardHeader, StatCard, StageFunnelStrip, ProgressBarRow } from '@/components/overview-ui'
import { OverviewDateFilter } from '@/components/overview-date-filter'
import { OverviewDownloadButton } from '@/components/overview-download-button'
import { Suspense } from 'react'

// Mirrors ref_stage's seq_order — the "pipeline" a parcel moves through end to end.
// Color follows the same red(new/urgent) -> amber(in progress) -> green(done well) ->
// gray(shipped out) convention used for the funnel strip.
const STAGE_META = [
  { code: 'RECEIVED', label: 'First Scan', color: 'bg-red-500' },
  { code: 'IN_STORAGE', label: 'TTXB Storage', color: 'bg-amber-500' },
  { code: 'IN_LIQUIDATION_AREA', label: 'Liquidation Inbound', color: 'bg-amber-500' },
  { code: 'REPACKED', label: 'Repacked', color: 'bg-amber-500' },
  { code: 'STRIPPED', label: 'Stripped', color: 'bg-amber-500' },
  { code: 'ON_PALLET', label: 'On Pallet', color: 'bg-amber-500' },
  { code: 'ENDORSED', label: 'Endorsed', color: 'bg-amber-500' },
  { code: 'SOLD', label: 'Sold', color: 'bg-emerald-600' },
  { code: 'OUTGOING', label: 'Outbound', color: 'bg-neutral-400' },
] as const

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
  sack_area: string | null
}

type StageEventRow = {
  stage: string
  event_ts: string
  scanned_by: string | null
  parcel_category: string | null
}
type SackEventRow = { action: string; event_ts: string; scanned_by: string | null; sack_area: string | null }
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
    return p.sack_area === 'STORAGE' ? 'Awaiting pallet consolidation (ex-Storage)' : 'Liquidation Area'
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

export async function OverviewPanel({ from, to }: { from?: string; to?: string } = {}) {
  const now = serverNow()
  const nowDate = new Date(now)
  const sevenDayStart = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const mtdStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1))
  const todayStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()))
  const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000)

  // Date-range filter (URL-driven, defaults to the last 7 SGT calendar days) — drives
  // the "Category breakdown" panel and the full-data export below.
  const defaultFromStr = dayKey(sevenDayStart.toISOString())
  const defaultToStr = dayKey(nowDate.toISOString())
  const rangeFromStr = from ?? defaultFromStr
  const rangeToStr = to ?? defaultToStr
  const rangeStart = new Date(`${rangeFromStr}T00:00:00+08:00`)
  const rangeEnd = new Date(`${rangeToStr}T23:59:59+08:00`)

  const earliestNeeded = new Date(Math.min(sevenDayStart.getTime(), mtdStart.getTime(), rangeStart.getTime()))
  // Week-to-date (Productivity) means "since Monday this week", distinct from the
  // rolling last-7-days window the rest of the page uses for "this week".
  const dayOfWeek = nowDate.getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const weekToDateStart = new Date(
    Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() - daysSinceMonday)
  )

  const [parcelRows, eventRows, sackEventRows, palletEventRows, stuckAtFirstScan] = await Promise.all([
    query<ParcelRow>(
      `select p.tid, p.parcel_category, p.current_stage, p.effective_value, p.pallet_id, p.batch_id, s.area as sack_area
         from parcel p
         left join sack s on s.sack_id = p.sack_id`
    ),
    query<StageEventRow>(
      `select se.stage, se.event_ts, se.scanned_by, p.parcel_category
         from stage_event se
         left join parcel p on p.tid = se.tid
        where se.stage in ('RECEIVED', 'IN_STORAGE', 'IN_LIQUIDATION_AREA', 'REPACKED')
          and se.event_ts >= ?`,
      [earliestNeeded]
    ),
    query<SackEventRow>(
      `select se.action, se.event_ts, se.scanned_by, s.area as sack_area
         from sack_event se
         left join sack s on s.sack_id = se.sack_id
        where se.action = 'STRIPPED' and se.event_ts >= ?`,
      [earliestNeeded]
    ),
    query<PalletEventRow>(
      `select action, event_ts, scanned_by
         from pallet_event
        where action in ('SACK_ADDED', 'TID_ADDED', 'ENDORSED', 'OUTGOING') and event_ts >= ?`,
      [earliestNeeded]
    ),
    query<{ tid: string; received_at: string | null }>(
      "select tid, received_at from parcel where current_stage = 'RECEIVED' order by received_at asc"
    ),
  ])

  // scanned_by stores the SSO email directly — no profile join needed.

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
        return sackEventRows.filter((e) => e.sack_area === 'STORAGE')
      case 'strip_liquidation':
        return sackEventRows.filter((e) => e.sack_area === 'LIQUIDATION')
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
  const profileRows = await query<{ email: string }>('select email from profile')
  const accountEmails = profileRows.map((p) => p.email)
  const productivity = accountEmails.map((email) => {
    const byActivity = ACTIVITIES.map((a) => {
      const rows = activityRows(a.key).filter((r) => r.scanned_by === email)
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
  const ttxbEntryForBacklog = ttxbStorageTids.length
    ? await query<{ tid: string; event_ts: string }>(
        "select tid, event_ts from stage_event where stage = 'IN_STORAGE' and tid in (?)",
        [ttxbStorageTids]
      )
    : []
  const earliestEntryByTid = new Map<string, string>()
  for (const e of ttxbEntryForBacklog) {
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
  const liqEntryEvents = liquidationTids.length
    ? await query<{ tid: string; event_ts: string }>(
        "select tid, event_ts from stage_event where stage = 'IN_LIQUIDATION_AREA' and tid in (?)",
        [liquidationTids]
      )
    : []
  const liqEntryByTid = new Map<string, string>()
  for (const e of liqEntryEvents) {
    const existing = liqEntryByTid.get(e.tid)
    if (!existing || new Date(e.event_ts) < new Date(existing)) liqEntryByTid.set(e.tid, e.event_ts)
  }

  const palletIdsForAging = Array.from(
    new Set(liquidationParcels.map((p) => p.pallet_id).filter((id): id is number => id != null))
  )
  const palletsForAging = palletIdsForAging.length
    ? await query<{ pallet_id: number; assembled_at: string | null }>(
        'select pallet_id, assembled_at from pallet where pallet_id in (?)',
        [palletIdsForAging]
      )
    : []
  const assembledAtByPallet = new Map(palletsForAging.map((p) => [p.pallet_id, p.assembled_at]))

  const batchIdsForAging = Array.from(
    new Set(liquidationSoldParcels.map((p) => p.batch_id).filter((id): id is number => id != null))
  )
  const salesForAging = batchIdsForAging.length
    ? await query<{ batch_id: number; sale_date: string | null }>(
        'select batch_id, sale_date from sale where batch_id in (?)',
        [batchIdsForAging]
      )
    : []
  const saleDateByBatch = new Map(salesForAging.map((s) => [s.batch_id, s.sale_date]))

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
      count: inWindow.filter((e) => e.parcel_category === code).length,
    }))
    return { total: inWindow.length, byCategory }
  }

  function receivedCountsBetween(start: Date, end: Date) {
    const inWindow = eventRows.filter((e) => {
      const t = new Date(e.event_ts).getTime()
      return e.stage === 'RECEIVED' && t >= start.getTime() && t <= end.getTime()
    })
    const byCategory = RECEIVED_CATEGORY_ORDER.map(({ code, label }) => ({
      code,
      label,
      count: inWindow.filter((e) => e.parcel_category === code).length,
    }))
    return { total: inWindow.length, byCategory }
  }

  const today = receivedCountsSince(todayStart)
  const last7 = receivedCountsSince(sevenDayStart)
  const mtd = receivedCountsSince(mtdStart)
  const rangeCategoryData = receivedCountsBetween(rangeStart, rangeEnd)
  const maxRangeCategoryCount = Math.max(1, ...rangeCategoryData.byCategory.map((c) => c.count))

  const todayLabel = formatDateLong(nowDate)
  const last7Label = `Last 7 days (${formatDateShort(sevenDayStart)} – ${formatDateShort(nowDate)})`
  const mtdLabel = `Month to date (${formatDateShort(mtdStart)} – ${formatDateShort(nowDate)})`

  const stageCounts = STAGE_META.map((s) => {
    const rows = parcelRows.filter((p) => p.current_stage === s.code)
    return { ...s, count: rows.length, gmv: gmvOf(rows) }
  })
  const maxStageCount = Math.max(1, ...stageCounts.map((s) => s.count))
  const totalGmv = gmvOf(ttxbStorageParcels) + gmvOf(liquidationParcels)

  // Everything currently on the page, flattened into CSV sections for the "download
  // all" export — one file, sections divided by a "## Title" marker row (a real
  // multi-tab workbook needs an xlsx library; see overview-download-button.tsx for
  // why that's not used here).
  const csvSections = [
    {
      title: 'Inventory Summary',
      headers: ['Metric', 'Value'],
      rows: [
        ['TTXB Storage - Count', ttxbStorageParcels.length],
        ['TTXB Storage - GMV', gmvOf(ttxbStorageParcels)],
        ['TTXB Storage - Backlog (>8 days)', ttxbBacklogCount],
        ['Liquidation Area - Count', liquidationParcels.length],
        ['Liquidation Area - GMV', gmvOf(liquidationParcels)],
        ['Liquidation Area - Not Sold Count', liquidationNotSoldParcels.length],
        ['Liquidation Area - Not Sold GMV', gmvOf(liquidationNotSoldParcels)],
        ['Liquidation Area - Sold Count', liquidationSoldParcels.length],
        ['Liquidation Area - Sold GMV', gmvOf(liquidationSoldParcels)],
        ['Liquidation Area - Avg Not-Sold Age (days)', avgNotSoldAgeDays != null ? avgNotSoldAgeDays.toFixed(1) : ''],
        ['Liquidation Area - Oldest Not-Sold Age (days)', oldestNotSoldAgeDays != null ? oldestNotSoldAgeDays.toFixed(1) : ''],
        ['Liquidation Area - Avg Time to Sale (days)', avgTimeToSaleDays != null ? avgTimeToSaleDays.toFixed(1) : ''],
        ['Total Inventory GMV', totalGmv],
      ] as (string | number)[][],
    },
    {
      title: 'TTXB Storage - Daily Entries (last 7 days)',
      headers: ['Date', 'Days in Storage', 'TIDs Entered'],
      rows: ttxbDailyEntries.map((d) => [d.date, d.daysAgo, d.count]) as (string | number)[][],
    },
    {
      title: 'Pipeline by Stage',
      headers: ['Stage', 'Count', 'GMV'],
      rows: stageCounts.map((s) => [s.label, s.count, s.gmv]) as (string | number)[][],
    },
    {
      title: `Category Breakdown (${rangeFromStr} to ${rangeToStr})`,
      headers: ['Category', 'Count'],
      rows: [
        ['Total', rangeCategoryData.total],
        ...rangeCategoryData.byCategory.map((c) => [c.label, c.count]),
      ] as (string | number)[][],
    },
    {
      title: 'Stuck at First Scan',
      headers: ['TID', 'Received At'],
      rows: (stuckAtFirstScan ?? []).map((p) => [p.tid, p.received_at ? formatDateTime(p.received_at) : '']) as (
        | string
        | number
      )[][],
    },
    {
      title: 'Activity (Today / This Week)',
      headers: ['Station', 'Grain', 'Today', 'This Week'],
      rows: activityCounts.map((a) => [a.label, a.grain, a.today, a.week]) as (string | number)[][],
    },
    {
      title: 'Productivity Summary',
      headers: ['Account', 'Today', 'WTD', 'MTD'],
      rows: productivity.map((p) => [p.email, p.todayTotal, p.weekTotal, p.monthTotal]) as (string | number)[][],
    },
    {
      title: 'Productivity by Scan Type',
      headers: ['Account', 'Scan', 'Today', 'WTD', 'MTD'],
      rows: productivity.flatMap((p) =>
        p.byActivity.filter((a) => a.month > 0).map((a) => [p.email, a.label, a.today, a.week, a.month])
      ) as (string | number)[][],
    },
    {
      title: 'Facility Breakdown',
      headers: ['Facility / Stage', 'Parcels'],
      rows: Array.from(facilityCounts.entries()) as (string | number)[][],
    },
    {
      title: `Category - ${todayLabel}`,
      headers: ['Category', 'Count'],
      rows: [['Total', today.total], ...today.byCategory.map((c) => [c.label, c.count])] as (string | number)[][],
    },
    {
      title: `Category - ${last7Label}`,
      headers: ['Category', 'Count'],
      rows: [['Total', last7.total], ...last7.byCategory.map((c) => [c.label, c.count])] as (string | number)[][],
    },
    {
      title: `Category - ${mtdLabel}`,
      headers: ['Category', 'Count'],
      rows: [['Total', mtd.total], ...mtd.byCategory.map((c) => [c.label, c.count])] as (string | number)[][],
    },
  ]

  return (
    <OverviewCanvas>
      <div>
        <span className="text-xs font-bold uppercase tracking-wide text-red-600">Live dashboard</span>
        <h2 className="mt-1 text-2xl font-bold text-neutral-900">Overview</h2>
        <p className="text-sm text-neutral-500">
          Live inventory by area, facility breakdown, activity counts across Scans 1–9, and
          First-Scan counts today / last 7 days / month to date.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Suspense fallback={<div className="h-[58px]" />}>
            <OverviewDateFilter defaultFrom={defaultFromStr} defaultTo={defaultToStr} />
          </Suspense>
          <OverviewDownloadButton sections={csvSections} />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          The date range controls the &quot;Category breakdown&quot; panel below; the download button exports
          every section on this page as one CSV.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TtxbInventoryBox
          count={ttxbStorageParcels.length}
          gmv={gmvOf(ttxbStorageParcels)}
          dailyEntries={ttxbDailyEntries}
          backlogCount={ttxbBacklogCount}
        />
        <Card className="border-l-4 border-l-emerald-600">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Inventory — Liquidation Area
          </div>
          <div className="mt-1 text-6xl font-bold text-neutral-900">{liquidationParcels.length}</div>
          <div className="text-xl font-semibold text-emerald-700">
            GMV ₱{gmvOf(liquidationParcels).toLocaleString()}
          </div>
          <div className="mt-2 flex flex-col gap-1 text-sm text-neutral-600">
            <div>
              Not sold: {liquidationNotSoldParcels.length} · GMV ₱{gmvOf(liquidationNotSoldParcels).toLocaleString()}
            </div>
            <div>
              Sold: {liquidationSoldParcels.length} · GMV ₱{gmvOf(liquidationSoldParcels).toLocaleString()}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
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
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                Avg time to sale: {avgTimeToSaleDays != null ? `${avgTimeToSaleDays.toFixed(0)} days` : 'No sales yet'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total inventory GMV"
          value={`₱${totalGmv.toLocaleString()}`}
          description={`${ttxbStorageParcels.length + liquidationParcels.length} parcels on hand`}
          accentDot="bg-red-600"
        />
        <StatCard
          label="TTXB Storage"
          value={String(ttxbStorageParcels.length)}
          description={`GMV ₱${gmvOf(ttxbStorageParcels).toLocaleString()}`}
          accentDot="bg-blue-600"
        />
        <StatCard
          label="Liquidation Area"
          value={String(liquidationParcels.length)}
          description={`GMV ₱${gmvOf(liquidationParcels).toLocaleString()} · ${liquidationSoldParcels.length} sold`}
          accentDot="bg-emerald-600"
        />
      </div>

      <Card>
        <CardHeader title="Pipeline by stage" subtitle="Live parcel counts across all 9 stages" />
        <StageFunnelStrip
          cells={stageCounts.map((s) => ({ key: s.code, label: s.label, count: s.count, color: s.color }))}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="By stage" subtitle="count + GMV" />
          <div className="mt-1 flex flex-col divide-y divide-neutral-50">
            {stageCounts.map((s) => (
              <ProgressBarRow
                key={s.code}
                label={s.label}
                count={s.count}
                maxCount={maxStageCount}
                detail={s.count > 0 ? `₱${s.gmv.toLocaleString()}` : '—'}
              />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="By category" subtitle={`First Scan · ${rangeFromStr} to ${rangeToStr}`} />
          <div className="mt-1 flex flex-col divide-y divide-neutral-50">
            {rangeCategoryData.byCategory.map((c) => (
              <ProgressBarRow
                key={c.code}
                label={c.label}
                count={c.count}
                maxCount={maxRangeCategoryCount}
                detail={`${c.count} in range`}
                barColor="bg-neutral-800"
              />
            ))}
          </div>
          {rangeCategoryData.byCategory.every((c) => c.count === 0) && (
            <p className="mt-2 text-sm text-neutral-400">No First Scans in the selected range.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`Stuck at First Scan (${stuckAtFirstScan?.length ?? 0})`}
          subtitle="not yet inbounded into either area"
        />
        <ul className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-neutral-100 text-sm">
          {(stuckAtFirstScan ?? []).map((p) => (
            <li
              key={p.tid}
              className="flex items-center justify-between border-b border-neutral-50 px-3 py-2 last:border-b-0"
            >
              <span className="font-mono">{p.tid}</span>
              <span className="text-neutral-500">
                {p.received_at ? formatDateTime(p.received_at) : '—'}
              </span>
            </li>
          ))}
          {(stuckAtFirstScan ?? []).length === 0 && (
            <li className="px-3 py-2 text-neutral-400">None — everything has moved past First Scan.</li>
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Activity today / this week" subtitle="Scans 1–9" />
        <table className="mt-2 w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Station</th>
              <th className="py-2 pr-4">Grain</th>
              <th className="py-2 pr-4">Today</th>
              <th className="py-2">This week</th>
            </tr>
          </thead>
          <tbody>
            {activityCounts.map((a) => (
              <tr key={a.key} className="border-b border-neutral-50">
                <td className="py-2 pr-4">{a.label}</td>
                <td className="py-2 pr-4 text-neutral-500">{a.grain}</td>
                <td className="py-2 pr-4 font-medium">{a.today}</td>
                <td className="py-2 font-medium">{a.week}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader title="Productivity" subtitle="scans by account — today / WTD / MTD" />
        <table className="mt-2 w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Account</th>
              <th className="py-2 pr-4">Today</th>
              <th className="py-2 pr-4">WTD</th>
              <th className="py-2">MTD</th>
            </tr>
          </thead>
          <tbody>
            {productivity.map((p) => (
              <tr key={p.email} className="border-b border-neutral-50">
                <td className="py-2 pr-4">{p.email}</td>
                <td className="py-2 pr-4 font-medium">{p.todayTotal}</td>
                <td className="py-2 pr-4 font-medium">{p.weekTotal}</td>
                <td className="py-2 font-medium">{p.monthTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {productivity.length === 0 && <p className="mt-2 text-sm text-neutral-400">No accounts found.</p>}

        {productivity.map((p) => (
          <div key={p.email} className="mt-3 flex flex-col gap-1">
            <h4 className="text-xs font-semibold text-neutral-700">{p.email} — by scan type</h4>
            <table className="w-full max-w-2xl text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-100 uppercase tracking-wide text-neutral-500">
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
                    <tr key={a.key} className="border-b border-neutral-50">
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
      </Card>

      <Card>
        <CardHeader title="Where everything currently is" />
        <table className="mt-2 w-full max-w-md text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Facility / stage</th>
              <th className="py-2">Parcels</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(facilityCounts.entries()).map(([facility, count]) => (
              <tr key={facility} className="border-b border-neutral-50">
                <td className="py-2 pr-4">{facility}</td>
                <td className="py-2 font-medium">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {facilityCounts.size === 0 && (
          <p className="mt-2 text-sm text-neutral-400">No parcels in the system yet.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { label: todayLabel, data: today },
          { label: last7Label, data: last7 },
          { label: mtdLabel, data: mtd },
        ].map(({ label, data }) => (
          <Card key={label}>
            <CardHeader title={label} />
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-4">Category (First Scan)</th>
                  <th className="py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-50">
                  <td className="py-2 pr-4 font-medium">Total</td>
                  <td className="py-2 font-medium">{data.total}</td>
                </tr>
                {data.byCategory.map((c) => (
                  <tr key={c.code} className="border-b border-neutral-50 text-neutral-600">
                    <td className="py-1.5 pl-4 pr-4">{c.label}</td>
                    <td className="py-1.5">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </OverviewCanvas>
  )
}
