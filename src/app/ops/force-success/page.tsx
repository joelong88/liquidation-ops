import { createClient } from '@/lib/supabase/server'

export default async function ForceSuccessPage() {
  const supabase = await createClient()
  const { data: parcels } = await supabase
    .from('parcel')
    .select('tid, current_stage, granular_status, resolved_output_bin, output_resolved_at')
    .eq('needs_force_success', true)
    .order('output_resolved_at', { ascending: true })

  const tidList = (parcels ?? []).map((p) => p.tid).join('\n')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Force-Success List</h2>
        <p className="text-sm text-neutral-500">
          TIDs flagged as needing a manual force-success — actioned by you outside the app, not
          here. This list is read-only; there&apos;s no action button on purpose. Which parcel
          statuses trigger this flag is still being defined — the list will stay empty until
          those rules are entered.
        </p>
      </div>

      {parcels && parcels.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="tidExport" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Copy list
          </label>
          <textarea
            id="tidExport"
            readOnly
            value={tidList}
            rows={4}
            className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
        </div>
      )}

      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">TID</th>
            <th className="py-2 pr-4">Stage</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2">Flagged</th>
          </tr>
        </thead>
        <tbody>
          {parcels?.map((p) => (
            <tr key={p.tid} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono">{p.tid}</td>
              <td className="py-2 pr-4">{p.current_stage}</td>
              <td className="py-2 pr-4">{p.granular_status ?? '—'}</td>
              <td className="py-2">
                {p.output_resolved_at ? new Date(p.output_resolved_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {parcels?.length === 0 && (
        <p className="text-sm text-neutral-400">
          Nothing flagged right now — expected until the triggering rules are defined.
        </p>
      )}
    </div>
  )
}
