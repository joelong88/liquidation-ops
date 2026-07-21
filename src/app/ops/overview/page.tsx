import { createClient } from '@/lib/supabase/server'
import { serverNow } from '@/lib/now'

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

function facilityFor(p: ParcelRow): string {
  if (p.current_stage === 'IN_STORAGE') return 'TTXB Storage Area'
  if (p.current_stage === 'IN_LIQUIDATION_AREA') return 'Liquidation Area'
  if (p.current_stage === 'STRIPPED') {
    return p.sack?.area === 'STORAGE' ? 'TTXB Storage Area' : 'Liquidation Area'
  }
  if (['ON_PALLET', 'ENDORSED', 'SOLD'].includes(p.current_stage)) return 'Liquidation Area'
  if (p.current_stage === 'RECEIVED') return 'Not yet placed (post First Scan)'
  if (p.current_stage === 'REPACKED') return 'Repacked (exited)'
  if (p.current_stage === 'OUTGOING') return 'Shipped out'
  return p.current_stage
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function OpsOverviewPage() {
  const supabase = await createClient()
  const now = serverNow()
  const nowDate = new Date(now)
  const sevenDayStart = new Date(now - 7 * 24 * 60 * 60 * 1000)
  const mtdStart = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1))
  const earliestNeeded = new Date(Math.min(sevenDayStart.getTime(), mtdStart.getTime()))

  const [{ data: parcels }, { data: events }] = await Promise.all([
    supabase.from('parcel').select('parcel_category, current_stage, sack:sack_id(area)'),
    supabase
      .from('stage_event')
      .select('stage, event_ts, parcel(parcel_category)')
      .eq('stage', 'RECEIVED')
      .gte('event_ts', earliestNeeded.toISOString()),
  ])

  const parcelRows = (parcels ?? []) as unknown as ParcelRow[]
  const eventRows = (events ?? []) as unknown as StageEventRow[]

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

  const todayLabel = nowDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const last7Label = `Last 7 days (${fmtShort(sevenDayStart)} – ${fmtShort(nowDate)})`
  const mtdLabel = `Month to date (${fmtShort(mtdStart)} – ${fmtShort(nowDate)})`

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Overview</h2>
        <p className="text-sm text-neutral-500">
          Facility breakdown of everything currently in the warehouse, plus First-Scan counts
          today / last 7 days / month to date.
        </p>
      </div>

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
