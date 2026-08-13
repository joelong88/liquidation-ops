import { createClient } from '@/lib/supabase/server'
import { CsvUploadForm } from '@/app/ops/data-source/csv-upload-form'
import { formatDateTime } from '@/lib/format-date'

export default async function DataSourcePage() {
  const supabase = await createClient()
  const [{ data: pending }, { count }, { data: uploads }, { data: profiles }] = await Promise.all([
    supabase
      .from('parcel_import')
      .select(
        'tid, granular_status, pets_ticket_type, pets_ticket_subtype, pets_ticket_outcome, shipper_segment_raw, goods_value, cod_value, insurance_value, xb_value_usd, imported_at'
      )
      .is('consumed_at', null)
      .order('imported_at', { ascending: false })
      .limit(50),
    supabase.from('parcel_import').select('tid', { count: 'exact', head: true }).is('consumed_at', null),
    supabase
      .from('csv_upload_log')
      .select('upload_id, uploaded_at, uploaded_by, total_rows, imported_count, skipped_count, ttxb_count, non_ttxb_count')
      .order('uploaded_at', { ascending: false })
      .limit(30),
    supabase.from('profile').select('id, full_name'),
  ])

  const rows = pending ?? []
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Data Source</h2>
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
              <th className="py-2 pr-4">Ticket Type</th>
              <th className="py-2 pr-4">Subtype</th>
              <th className="py-2 pr-4">Outcome</th>
              <th className="py-2 pr-4">Segment</th>
              <th className="py-2 pr-4">Goods</th>
              <th className="py-2 pr-4">COD</th>
              <th className="py-2 pr-4">Insurance</th>
              <th className="py-2 pr-4">XB (USD)</th>
              <th className="py-2">Imported</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tid} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono">{r.tid}</td>
                <td className="py-2 pr-4">{r.granular_status ?? '—'}</td>
                <td className="py-2 pr-4">{r.pets_ticket_type ?? '—'}</td>
                <td className="py-2 pr-4">{r.pets_ticket_subtype ?? '—'}</td>
                <td className="py-2 pr-4">{r.pets_ticket_outcome ?? '—'}</td>
                <td className="py-2 pr-4">{r.shipper_segment_raw ?? '—'}</td>
                <td className="py-2 pr-4">{r.goods_value ?? '—'}</td>
                <td className="py-2 pr-4">{r.cod_value ?? '—'}</td>
                <td className="py-2 pr-4">{r.insurance_value ?? '—'}</td>
                <td className="py-2 pr-4">{r.xb_value_usd ?? '—'}</td>
                <td className="py-2">{formatDateTime(r.imported_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-sm text-neutral-400">No pending imports — upload a CSV above.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Upload history
        </h3>
        <table className="w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Uploaded</th>
              <th className="py-2 pr-4">By</th>
              <th className="py-2 pr-4">Rows</th>
              <th className="py-2 pr-4">Imported</th>
              <th className="py-2 pr-4">Skipped</th>
              <th className="py-2 pr-4">TTXB</th>
              <th className="py-2">Non-TTXB</th>
            </tr>
          </thead>
          <tbody>
            {(uploads ?? []).map((u) => (
              <tr key={u.upload_id} className="border-b border-neutral-100">
                <td className="py-2 pr-4">{formatDateTime(u.uploaded_at)}</td>
                <td className="py-2 pr-4">{u.uploaded_by ? (nameById.get(u.uploaded_by) ?? 'Unknown') : '—'}</td>
                <td className="py-2 pr-4">{u.total_rows}</td>
                <td className="py-2 pr-4">{u.imported_count}</td>
                <td className="py-2 pr-4">{u.skipped_count}</td>
                <td className="py-2 pr-4">{u.ttxb_count}</td>
                <td className="py-2">{u.non_ttxb_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(uploads ?? []).length === 0 && (
          <p className="text-sm text-neutral-400">No uploads yet.</p>
        )}
      </div>
    </div>
  )
}
