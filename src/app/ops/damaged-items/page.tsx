import { query } from '@/lib/db/mysql'
import { DamagedForm } from '@/app/ops/damaged-items/damaged-form'
import { CsvDownloadButton } from '@/app/ops/damaged-items/csv-download-button'
import { formatDateTime } from '@/lib/format-date'
import { CardHeader } from '@/components/overview-ui'

type DamagedRow = {
  tid: string
  item_description: string | null
  damage_reason: string | null
  damaged_by: string | null
  damaged_at: string | null
}

export default async function DamagedItemsPage() {
  const rows = await query<DamagedRow>(
    `select tid, manual_value_item_description as item_description, damage_reason, damaged_by, damaged_at
       from parcel
      where current_stage = 'DAMAGED'
      order by damaged_at desc`
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <CardHeader title="Damaged Items" />
        <p className="mt-2 text-sm text-neutral-500">
          Scan a TID out when a closed sack is opened for stripping and an item turns out
          damaged or leaking — it&apos;s pulled out of its sack immediately, so Strip &amp;
          Consolidate (and the pallet it would have joined) never sees it.
        </p>
      </div>

      <DamagedForm />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">
            Damaged ({rows.length})
          </h3>
          {rows.length > 0 && <CsvDownloadButton rows={rows} />}
        </div>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">TID</th>
              <th className="py-2 pr-4">Item Description</th>
              <th className="py-2 pr-4">Reason</th>
              <th className="py-2 pr-4">Scanned By</th>
              <th className="py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tid} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono">{r.tid}</td>
                <td className="py-2 pr-4">{r.item_description ?? '—'}</td>
                <td className="py-2 pr-4">{r.damage_reason ?? '—'}</td>
                <td className="py-2 pr-4">{r.damaged_by ?? '—'}</td>
                <td className="py-2">{r.damaged_at ? formatDateTime(r.damaged_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-sm text-neutral-400">No damaged items recorded yet.</p>
        )}
      </div>
    </div>
  )
}
