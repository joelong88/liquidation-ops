import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { serverNow } from '@/lib/now'

export default async function StoragePage() {
  const profile = await requireRole(['recovery_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const { data: parcels } = await supabase
    .from('parcel')
    .select('tid, hold_until, hold_forced_success, cod_value, pallet_code')
    .eq('shipper_segment', 'TTXB')
    .eq('current_stage', 'IN_STORAGE')
    .is('batch_id', null)
    .order('hold_until', { ascending: true, nullsFirst: true })

  const now = serverNow()

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">TTXB storage &amp; hold</h1>
        <p className="text-sm text-neutral-500">
          TikTok Crossborder parcels currently in storage, sorted by maturity date.
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">TID</th>
            <th className="py-2 pr-4">Pallet</th>
            <th className="py-2 pr-4">COD</th>
            <th className="py-2 pr-4">Hold until</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {parcels?.map((p) => {
            const matured = !p.hold_until || new Date(p.hold_until).getTime() <= now
            const eligible = matured || p.hold_forced_success
            return (
              <tr key={p.tid} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono">{p.tid}</td>
                <td className="py-2 pr-4">{p.pallet_code ?? '—'}</td>
                <td className="py-2 pr-4">
                  {p.cod_value != null ? `₱${Number(p.cod_value).toLocaleString()}` : '—'}
                </td>
                <td className="py-2 pr-4">
                  {p.hold_until ? new Date(p.hold_until).toLocaleDateString() : '—'}
                </td>
                <td className="py-2">
                  {eligible ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      Eligible now
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      Waiting
                    </span>
                  )}
                  {p.hold_forced_success && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Forced
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {parcels?.length === 0 && (
        <p className="text-sm text-neutral-400">Nothing currently in TTXB storage.</p>
      )}
    </main>
  )
}
