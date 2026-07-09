import Link from 'next/link'
import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { serverNow } from '@/lib/now'

const STAGE_ORDER = [
  { code: 'RECEIVED', label: 'Received' },
  { code: 'STAMPED', label: 'NV Stamped' },
  { code: 'IN_STORAGE', label: 'In Storage' },
  { code: 'ENDORSED', label: 'Endorsed (in a batch)' },
  { code: 'OUTGOING', label: 'Outgoing' },
] as const

const OTHER_CATEGORY_ORDER = [
  { code: 'REPACK', label: 'Repack' },
  { code: 'STAGING', label: 'Staging' },
  { code: 'TICKET_CREATION', label: 'Ticket Creation' },
  { code: 'INVESTIGATION', label: 'Investigation' },
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

export default async function PipelinePage() {
  const profile = await requireRole(['recovery_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const { data: parcels } = await supabase
    .from('parcel')
    .select('parcel_category, current_stage, shipper_segment, hold_until, hold_forced_success')

  const now = serverNow()
  const rows = parcels ?? []

  const liquidation = rows.filter((p) => p.parcel_category === 'LIQUIDATION')
  const other = rows.filter((p) => p.parcel_category !== 'LIQUIDATION')

  const stageCounts = STAGE_ORDER.map(({ code, label }) => {
    const atStage = liquidation.filter((p) => p.current_stage === code)
    const ttxb = atStage.filter((p) => p.shipper_segment === 'TTXB')
    const rest = atStage.filter((p) => p.shipper_segment !== 'TTXB')
    const matured = ttxb.filter(
      (p) => !p.hold_until || new Date(p.hold_until).getTime() <= now || p.hold_forced_success
    ).length
    return { code, label, ttxbTotal: ttxb.length, matured, waiting: ttxb.length - matured, rest: rest.length }
  })

  const categoryCounts = OTHER_CATEGORY_ORDER.map(({ code, label }) => ({
    code,
    label,
    count: other.filter((p) => p.parcel_category === code).length,
  }))
  const uncategorized = rows.filter((p) => !p.parcel_category).length

  // Anomaly signal: a non-liquidation parcel that somehow progressed past RECEIVED.
  // Nothing in the app is supposed to move these forward, so any nonzero count here
  // means a scan happened that the intended workflow didn't anticipate.
  const misroutedCount = other.filter(
    (p) => (STAGE_SEQ[p.current_stage] ?? 0) > STAGE_SEQ.RECEIVED
  ).length

  return (
    <main className="flex min-h-screen flex-col gap-8 p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Pipeline overview</h1>
        <p className="text-sm text-neutral-500">
          Snapshot of every parcel&apos;s current stage, right now.
        </p>
      </div>

      {misroutedCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {misroutedCount} non-liquidation parcel{misroutedCount === 1 ? '' : 's'} advanced past
          Received — that shouldn&apos;t normally happen, worth a look.
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">
          Liquidation-track parcels, by stage
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Stage</th>
              <th className="py-2 pr-4">TTXB</th>
              <th className="py-2 pr-4">Other segments</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {stageCounts.map((s) => (
              <tr key={s.code} className="border-b border-neutral-100">
                <td className="py-2 pr-4">{s.label}</td>
                <td className="py-2 pr-4">
                  {s.ttxbTotal}
                  {s.code === 'IN_STORAGE' && s.ttxbTotal > 0 && (
                    <span className="ml-2 text-xs text-neutral-500">
                      ({s.matured} eligible, {s.waiting} waiting on hold)
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{s.rest}</td>
                <td className="py-2 font-medium">{s.ttxbTotal + s.rest}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-neutral-400">
          TTXB parcels only clear the 7-day hold before becoming batch-eligible — the In
          Storage row splits eligible-now vs. still-waiting. Other segments have no hold, so
          they move through as soon as they&apos;re scanned. Once Endorsed, further status
          (priced/sold) is tracked per batch — see{' '}
          <Link href="/recovery/batches" className="underline">
            Batches
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">
          Non-liquidation parcels, by category
        </h2>
        <p className="text-xs text-neutral-500">
          Logged at Incoming and not carried further by the app — routed to their existing
          process outside this system.
        </p>
        <table className="w-full max-w-sm text-left text-sm">
          <tbody>
            {categoryCounts.map((c) => (
              <tr key={c.code} className="border-b border-neutral-100">
                <td className="py-2 pr-4">{c.label}</td>
                <td className="py-2 font-medium">{c.count}</td>
              </tr>
            ))}
            {uncategorized > 0 && (
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-4 text-neutral-500">Uncategorized</td>
                <td className="py-2 font-medium">{uncategorized}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  )
}
