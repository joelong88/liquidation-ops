import { createClient } from '@/lib/supabase/server'
import { CsvDownloadButton } from '@/app/ops/force-success/csv-download-button'
import { formatDate } from '@/lib/format-date'
import { CardHeader } from '@/components/overview-ui'

export default async function ForceSuccessPage() {
  const supabase = await createClient()
  const { data: parcels } = await supabase
    .from('parcel')
    .select('tid, current_stage, granular_status, resolved_output_bin, output_resolved_at')
    .eq('needs_force_success', true)
    .order('output_resolved_at', { ascending: true })

  const rows = parcels ?? []
  const tidList = rows.map((p) => p.tid).join('\n')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <CardHeader title="Force-Success List" />
        <p className="mt-2 text-sm text-neutral-500">
          TIDs flagged as needing a manual force-success — actioned by you outside the app, not
          here. This list is read-only; there&apos;s no action button on purpose. Which parcel
          statuses trigger this flag is still being defined — the list will stay empty until
          those rules are entered.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <CsvDownloadButton rows={rows} />
            <span className="text-xs text-neutral-500">{rows.length} TID(s)</span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tidExport" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Or copy the plain list
            </label>
            <textarea
              id="tidExport"
              readOnly
              value={tidList}
              rows={4}
              className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs"
            />
          </div>
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
          {rows.map((p) => (
            <tr key={p.tid} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono">{p.tid}</td>
              <td className="py-2 pr-4">{p.current_stage}</td>
              <td className="py-2 pr-4">{p.granular_status ?? '—'}</td>
              <td className="py-2">
                {p.output_resolved_at ? formatDate(p.output_resolved_at) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-sm text-neutral-400">
          Nothing flagged right now — expected until the triggering rules are defined.
        </p>
      )}
    </div>
  )
}
