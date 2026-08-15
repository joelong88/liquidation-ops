import { query } from '@/lib/db/mysql'
import { CsvUploadForm } from '@/app/ops/data-source/csv-upload-form'
import { formatDateTime } from '@/lib/format-date'
import { CardHeader } from '@/components/overview-ui'

type PendingRow = {
  tid: string
  granular_status: string | null
  pets_ticket_type: string | null
  pets_ticket_subtype: string | null
  pets_ticket_outcome: string | null
  shipper_segment_raw: string | null
  goods_value: number | null
  cod_value: number | null
  insurance_value: number | null
  xb_value_usd: number | null
  imported_at: string
}

type UploadRow = {
  upload_id: number
  uploaded_at: string
  uploaded_by: string | null
  total_rows: number
  imported_count: number
  skipped_count: number
  ttxb_count: number
  non_ttxb_count: number
}

export default async function DataSourcePage() {
  const [rows, countRows, uploads, profiles] = await Promise.all([
    query<PendingRow>(
      `select tid, granular_status, pets_ticket_type, pets_ticket_subtype, pets_ticket_outcome,
              shipper_segment_raw, goods_value, cod_value, insurance_value, xb_value_usd, imported_at
         from parcel_import
        where consumed_at is null
        order by imported_at desc
        limit 50`
    ),
    query<{ count: number }>('select count(*) as count from parcel_import where consumed_at is null'),
    query<UploadRow>(
      `select upload_id, uploaded_at, uploaded_by, total_rows, imported_count, skipped_count, ttxb_count, non_ttxb_count
         from csv_upload_log
        order by uploaded_at desc
        limit 30`
    ),
    query<{ email: string; full_name: string | null }>('select email, full_name from profile'),
  ])

  const count = countRows[0]?.count ?? 0
  const nameById = new Map(profiles.map((p) => [p.email, p.full_name]))

  return (
    <div className="flex flex-col gap-6">
      <CardHeader title="Data Source" />

      <CsvUploadForm />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">
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
        <h3 className="text-sm font-semibold text-neutral-900">Upload history</h3>
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
