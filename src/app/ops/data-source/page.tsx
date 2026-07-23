import { createClient } from '@/lib/supabase/server'
import { CsvUploadForm } from '@/app/ops/data-source/csv-upload-form'
import { formatDateTime } from '@/lib/format-date'

export default async function DataSourcePage() {
  const supabase = await createClient()
  const { data: pending } = await supabase
    .from('parcel_import')
    .select('tid, granular_status, cod_value, item_description, imported_at')
    .is('consumed_at', null)
    .order('imported_at', { ascending: false })
    .limit(50)

  const { count } = await supabase
    .from('parcel_import')
    .select('tid', { count: 'exact', head: true })
    .is('consumed_at', null)

  const rows = pending ?? []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Data Source</h2>
        <p className="text-sm text-neutral-500">
          Upload a CSV of TIDs expected to come through First Scan, along with their
          status, COD value, and item description. This is what First Scan&apos;s output-bin
          logic actually matches against — without it, every scan falls back to bin F.
          A row is used up (and removed from the pending list below) the moment its TID
          is physically First-Scanned.
        </p>
      </div>

      <CsvUploadForm />

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Pending ({count ?? 0}) — not yet First-Scanned
        </h3>
        <table className="w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">TID</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">COD Value</th>
              <th className="py-2 pr-4">Item Description</th>
              <th className="py-2">Imported</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tid} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono">{r.tid}</td>
                <td className="py-2 pr-4">{r.granular_status ?? '—'}</td>
                <td className="py-2 pr-4">{r.cod_value ?? '—'}</td>
                <td className="py-2 pr-4">{r.item_description ?? '—'}</td>
                <td className="py-2">{formatDateTime(r.imported_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-sm text-neutral-400">No pending imports — upload a CSV above.</p>
        )}
      </div>
    </div>
  )
}
