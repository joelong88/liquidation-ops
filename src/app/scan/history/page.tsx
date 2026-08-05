import { getCurrentProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'
import { BackToDashboard } from '@/components/back-to-dashboard'
import { formatDateTime } from '@/lib/format-date'

// stage_event only ever logs these four stages (strip/consolidate/endorse/outbound
// are sack_event/pallet_event instead) — mapped to the operator-facing scan number
// from the /ops station list, since raw stage codes don't mean anything to Joel.
const STAGE_TO_SCAN: Record<string, string> = {
  RECEIVED: '1. First Scan',
  IN_STORAGE: '2. Inbound → TTXB Storage',
  REPACKED: '3. Repack (TTXB Storage)',
  IN_LIQUIDATION_AREA: '5. New Arrival (Liquidation Area)',
}

export default async function ScanHistoryPage() {
  const profile = await getCurrentProfile()

  if (!profile || !['warehouse_ops', 'recovery_team', 'owner'].includes(profile.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-neutral-600">
          This page is for warehouse ops and recovery team accounts.
        </p>
      </main>
    )
  }

  const supabase = await createClient()
  const [{ data: events, error }, { data: profiles }] = await Promise.all([
    supabase
      .from('stage_event')
      .select('event_id, tid, stage, event_ts, scanned_by')
      .order('event_ts', { ascending: false })
      .limit(50),
    supabase.from('profile').select('id, full_name'),
  ])

  // scanned_by references auth.users directly (not profile), so there's no FK
  // PostgREST can embed through — join by hand instead.
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <BackToDashboard />
      <h1 className="text-lg font-semibold text-neutral-900">Recent scans</h1>
      {error && <p className="text-sm text-red-600">Couldn&apos;t load scan history.</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">TID</th>
            <th className="py-2 pr-4">Scan</th>
            <th className="py-2 pr-4">Scanned by</th>
            <th className="py-2">When (SGT)</th>
          </tr>
        </thead>
        <tbody>
          {events?.map((e) => (
            <tr key={e.event_id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono">{e.tid}</td>
              <td className="py-2 pr-4">{STAGE_TO_SCAN[e.stage] ?? e.stage}</td>
              <td className="py-2 pr-4">
                {e.scanned_by ? (nameById.get(e.scanned_by) ?? 'Unknown account') : '—'}
              </td>
              <td className="py-2">{formatDateTime(e.event_ts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {events?.length === 0 && <p className="text-sm text-neutral-400">No scans recorded yet.</p>}
    </main>
  )
}
