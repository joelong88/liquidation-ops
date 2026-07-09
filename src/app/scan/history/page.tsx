import { getCurrentProfile } from '@/lib/supabase/profile'
import { createClient } from '@/lib/supabase/server'

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
  const { data: events, error } = await supabase
    .from('stage_event')
    .select('event_id, tid, stage, event_ts, station, parcel(parcel_category, shipper_segment)')
    .order('event_ts', { ascending: false })
    .limit(50)

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-900">Recent scans</h1>
      {error && <p className="text-sm text-red-600">Couldn&apos;t load scan history.</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">TID</th>
            <th className="py-2 pr-4">Stage</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Segment</th>
            <th className="py-2 pr-4">Station</th>
            <th className="py-2">When</th>
          </tr>
        </thead>
        <tbody>
          {events?.map((e) => (
            <tr key={e.event_id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono">{e.tid}</td>
              <td className="py-2 pr-4">{e.stage}</td>
              <td className="py-2 pr-4">{e.parcel?.parcel_category ?? '—'}</td>
              <td className="py-2 pr-4">{e.parcel?.shipper_segment ?? '—'}</td>
              <td className="py-2 pr-4">{e.station ?? '—'}</td>
              <td className="py-2">{new Date(e.event_ts).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {events?.length === 0 && <p className="text-sm text-neutral-400">No scans recorded yet.</p>}
    </main>
  )
}
