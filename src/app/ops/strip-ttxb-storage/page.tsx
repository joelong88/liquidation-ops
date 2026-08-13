import { createClient } from '@/lib/supabase/server'
import { serverNow } from '@/lib/now'
import { StripAndConsolidateForm } from '@/app/ops/strip-and-consolidate-form'
import { ForceSuccessForm } from '@/app/ops/strip-ttxb-storage/force-success-form'
import { formatDate } from '@/lib/format-date'

export default async function StripTtxbStoragePage() {
  const supabase = await createClient()
  const { data: sacks } = await supabase
    .from('sack')
    .select('sack_id, sack_code, shipper_segment, hold_until, hold_forced_success, status')
    .eq('area', 'STORAGE')
    .eq('status', 'CLOSED')
    .order('hold_until', { ascending: true, nullsFirst: true })

  const sackIds = (sacks ?? []).map((s) => s.sack_id)
  const { data: memberCounts } = sackIds.length
    ? await supabase.from('parcel').select('sack_id').in('sack_id', sackIds)
    : { data: [] }

  const countBySack = new Map<number, number>()
  for (const row of memberCounts ?? []) {
    if (row.sack_id == null) continue
    countBySack.set(row.sack_id, (countBySack.get(row.sack_id) ?? 0) + 1)
  }

  const now = serverNow()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Strip &amp; Consolidate — TTXB Storage Area
        </h2>
        <p className="text-sm text-neutral-500">
          Sack-level scan, hold-gated. Scan a pallet ID once, then scan each closed sack — it
          gets stripped and added straight onto that pallet in one confirmation. Close the
          pallet once it&apos;s full to start a new one. The list below shows closed sacks
          awaiting strip, sorted by maturity — force success if one needs to strip before its
          7-day hold matures.
        </p>
      </div>

      <StripAndConsolidateForm area="STORAGE" />

      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">Sack</th>
            <th className="py-2 pr-4">Segment</th>
            <th className="py-2 pr-4">Parcels</th>
            <th className="py-2 pr-4">Hold until</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2">Force success</th>
          </tr>
        </thead>
        <tbody>
          {sacks?.map((s) => {
            const matured = !s.hold_until || new Date(s.hold_until).getTime() <= now
            const eligible = matured || s.hold_forced_success
            return (
              <tr key={s.sack_id} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono">{s.sack_code}</td>
                <td className="py-2 pr-4">{s.shipper_segment ?? '—'}</td>
                <td className="py-2 pr-4">{countBySack.get(s.sack_id) ?? 0}</td>
                <td className="py-2 pr-4">
                  {s.hold_until ? formatDate(s.hold_until) : '—'}
                </td>
                <td className="py-2 pr-4">
                  {eligible ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      Eligible now
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      Waiting
                    </span>
                  )}
                  {s.hold_forced_success && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Forced
                    </span>
                  )}
                </td>
                <td className="py-2">{!eligible && <ForceSuccessForm sackCode={s.sack_code} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sacks?.length === 0 && (
        <p className="text-sm text-neutral-400">
          No closed sacks waiting to strip — close a sack at the Storage inbound station first.
        </p>
      )}
    </div>
  )
}
