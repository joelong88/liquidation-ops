import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { serverNow } from '@/lib/now'

// Descriptions shown once in the "What each status means" legend below. Stamped's
// description is a best-effort inference from the legacy tracker's column names
// (Date Processed (NV Stamp), PETS Ticket Type, Ticket Outcome, Item Type) — not
// confirmed against a real definitions doc. Outgoing is similarly uncertain: the
// legacy "7 Outgoing" sheet's sample rows showed `Pull Out From (Area) = REPACK`,
// which suggests it may track Repack/RTS outbound movement rather than post-sale
// shipment to the buyer. Flagged to the user; update this text once confirmed.
const STAGE_DESCRIPTIONS = [
  {
    code: 'RECEIVED',
    label: 'Received',
    description: 'Scanned into the liquidation warehouse for the first time.',
  },
  {
    code: 'STAMPED',
    label: 'Stamped',
    description:
      'Processed at the NV Stamp station — best understanding (not confirmed) is that any PETS ticket tied to the parcel gets resolved and the item gets classified (e.g. HVI vs Non-HVI) here.',
  },
  {
    code: 'IN_STORAGE',
    label: 'In Storage',
    description:
      'Additional scan for TikTok Crossborder (TTXB) parcels — starts the 7-day hold before the parcel is eligible for sale. Other segments have no hold.',
  },
  {
    code: 'ENDORSED',
    label: 'Endorsed',
    description: 'Pulled into a batch and endorsed for liquidation sale.',
  },
  {
    code: 'OUTGOING',
    label: 'Outgoing',
    description:
      'Scanned as having physically left the warehouse. Not the same as Endorsed. Unconfirmed whether this should specifically mean "shipped to the winning buyer after sale" — the legacy sheet this is based on had ambiguous sample data.',
  },
] as const

// Received's subcategories. Repack isn't in the list Joel gave (Liquidation, Staging,
// Ticket Creation, Investigation) but is included here anyway — it's the second-largest
// category by real volume (11%), and leaving it out would make these rows not sum to
// the Received total shown above them. Flagged to Joel; remove if genuinely unwanted.
const RECEIVED_CATEGORY_ORDER = [
  {
    code: 'LIQUIDATION',
    label: 'Liquidation',
    description: 'Classified as sellable — continues through the rest of this pipeline toward a sale.',
  },
  {
    code: 'REPACK',
    label: 'Repack',
    description:
      'Needs repacking before resuming delivery — not part of the liquidation sale pool. (Not in the list you gave — included since it’s ~11% of real volume; remove if not wanted.)',
  },
  {
    code: 'STAGING',
    label: 'Staging',
    description:
      'Held pending a decision from another team (on-hold ticket, duplicate item, etc.) — not part of the liquidation sale pool.',
  },
  {
    code: 'TICKET_CREATION',
    label: 'Ticket Creation',
    description:
      'Cancelled and being processed for return to shipper — not part of the liquidation sale pool.',
  },
  {
    code: 'INVESTIGATION',
    label: 'Investigation',
    description:
      'Damaged and under assessment for repack or disposal — not part of the liquidation sale pool.',
  },
] as const

const STAGE_SEQ: Record<string, number> = {
  RECEIVED: 1,
  STAMPED: 2,
  IN_STORAGE: 3,
  ENDORSED: 4,
  BATCHED: 5,
  SOLD: 6,
  OUTGOING: 7,
}

type ParcelRow = {
  parcel_category: string | null
  current_stage: string
  shipper_segment: string
  hold_until: string | null
  hold_forced_success: boolean
}

type StageEventRow = {
  stage: string
  event_ts: string
  parcel: { parcel_category: string | null } | null
}

type PeriodCounts = {
  receivedByCategory: { code: string; label: string; count: number }[]
  receivedTotal: number
  stamped: number
  inStorage: number
  inStorageNote?: string
  endorsed: number
  outgoing: number
}

function snapshotCounts(parcels: ParcelRow[], now: number): PeriodCounts {
  const receivedByCategory = RECEIVED_CATEGORY_ORDER.map(({ code, label }) => ({
    code,
    label,
    count: parcels.filter((p) => p.current_stage === 'RECEIVED' && p.parcel_category === code)
      .length,
  }))
  const receivedTotal = receivedByCategory.reduce((sum, c) => sum + c.count, 0)

  const inStorageParcels = parcels.filter((p) => p.current_stage === 'IN_STORAGE')
  const ttxbInStorage = inStorageParcels.filter((p) => p.shipper_segment === 'TTXB')
  const matured = ttxbInStorage.filter(
    (p) => !p.hold_until || new Date(p.hold_until).getTime() <= now || p.hold_forced_success
  ).length
  const waiting = ttxbInStorage.length - matured

  return {
    receivedByCategory,
    receivedTotal,
    stamped: parcels.filter((p) => p.current_stage === 'STAMPED').length,
    inStorage: inStorageParcels.length,
    inStorageNote:
      ttxbInStorage.length > 0 ? `${matured} eligible, ${waiting} waiting on hold — TTXB` : undefined,
    endorsed: parcels.filter((p) => p.current_stage === 'ENDORSED').length,
    outgoing: parcels.filter((p) => p.current_stage === 'OUTGOING').length,
  }
}

function windowCounts(events: StageEventRow[], windowStart: Date): PeriodCounts {
  const inWindow = events.filter((e) => new Date(e.event_ts).getTime() >= windowStart.getTime())
  const receivedByCategory = RECEIVED_CATEGORY_ORDER.map(({ code, label }) => ({
    code,
    label,
    count: inWindow.filter((e) => e.stage === 'RECEIVED' && e.parcel?.parcel_category === code)
      .length,
  }))
  const receivedTotal = receivedByCategory.reduce((sum, c) => sum + c.count, 0)

  return {
    receivedByCategory,
    receivedTotal,
    stamped: inWindow.filter((e) => e.stage === 'STAMPED').length,
    inStorage: inWindow.filter((e) => e.stage === 'IN_STORAGE').length,
    endorsed: inWindow.filter((e) => e.stage === 'ENDORSED').length,
    outgoing: inWindow.filter((e) => e.stage === 'OUTGOING').length,
  }
}

function PeriodTable({ title, data }: { title: string; data: PeriodCounts }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <table className="w-full max-w-lg text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">Stage</th>
            <th className="py-2">Count</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-neutral-100">
            <td className="py-2 pr-4 font-medium">1. Received</td>
            <td className="py-2 font-medium">{data.receivedTotal}</td>
          </tr>
          {data.receivedByCategory.map((c) => (
            <tr key={c.code} className="border-b border-neutral-100 text-neutral-600">
              <td className="py-1.5 pl-6 pr-4">{c.label}</td>
              <td className="py-1.5">{c.count}</td>
            </tr>
          ))}
          <tr className="border-b border-neutral-100">
            <td className="py-2 pr-4 font-medium">2. Stamped</td>
            <td className="py-2 font-medium">{data.stamped}</td>
          </tr>
          <tr className="border-b border-neutral-100">
            <td className="py-2 pr-4 font-medium">
              3. In Storage
              {data.inStorageNote && (
                <span className="ml-2 text-xs font-normal text-neutral-500">
                  ({data.inStorageNote})
                </span>
              )}
            </td>
            <td className="py-2 font-medium">{data.inStorage}</td>
          </tr>
          <tr className="border-b border-neutral-100">
            <td className="py-2 pr-4 font-medium">4. Endorsed</td>
            <td className="py-2 font-medium">{data.endorsed}</td>
          </tr>
          <tr className="border-b border-neutral-100">
            <td className="py-2 pr-4 font-medium">5. Outgoing</td>
            <td className="py-2 font-medium">{data.outgoing}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function OverviewPage() {
  const profile = await requireRole(['recovery_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const now = serverNow()
  const nowDate = new Date(now)

  const sevenDayStart = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const mtdStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1))
  const earliestNeeded = new Date(Math.min(sevenDayStart.getTime(), mtdStart.getTime()))

  const [{ data: events }, { data: parcels }] = await Promise.all([
    supabase
      .from('stage_event')
      .select('stage, event_ts, parcel(parcel_category)')
      .gte('event_ts', earliestNeeded.toISOString()),
    supabase
      .from('parcel')
      .select('parcel_category, current_stage, shipper_segment, hold_until, hold_forced_success'),
  ])

  const eventRows = (events ?? []) as StageEventRow[]
  const parcelRows = (parcels ?? []) as ParcelRow[]

  const today = snapshotCounts(parcelRows, now)
  const last7 = windowCounts(eventRows, sevenDayStart)
  const mtd = windowCounts(eventRows, mtdStart)

  const todayLabel = nowDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const last7Label = `Last 7 days (${fmtShort(sevenDayStart)} – ${fmtShort(nowDate)}, ${nowDate.getFullYear()})`
  const mtdLabel = `Month to date (${fmtShort(mtdStart)} – ${fmtShort(nowDate)}, ${nowDate.getFullYear()})`

  const other = parcelRows.filter((p) => p.parcel_category !== 'LIQUIDATION')
  const misroutedCount = other.filter(
    (p) => (STAGE_SEQ[p.current_stage] ?? 0) > STAGE_SEQ.RECEIVED
  ).length

  return (
    <main className="flex min-h-screen flex-col gap-8 p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Parcel count overview</h1>
        <p className="text-sm text-neutral-500">
          Today&apos;s snapshot, last 7 days, and month to date.
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">What each status means</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {[...STAGE_DESCRIPTIONS, ...RECEIVED_CATEGORY_ORDER].map((s) => (
            <div key={s.code}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {s.label}
              </dt>
              <dd className="text-xs text-neutral-600">{s.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      {misroutedCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {misroutedCount} non-liquidation parcel{misroutedCount === 1 ? '' : 's'} advanced past
          Received — that shouldn&apos;t normally happen, worth a look.
        </div>
      )}

      <PeriodTable title={todayLabel} data={today} />
      <PeriodTable title={last7Label} data={last7} />
      <PeriodTable title={mtdLabel} data={mtd} />
    </main>
  )
}
