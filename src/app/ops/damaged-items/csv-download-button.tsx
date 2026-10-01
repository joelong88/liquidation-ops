'use client'

import { formatDateTime } from '@/lib/format-date'

type Row = {
  tid: string
  item_description: string | null
  damage_reason: string | null
  damaged_by: string | null
  damaged_at: string | Date | null
}

function toCsv(rows: Row[]) {
  const header = ['TID', 'Item Description', 'Reason', 'Scanned By', 'When']
  // damaged_at arrives as a native Date object (the DB layer returns DATETIME
  // columns as Date, not string) — escape() must coerce defensively, since
  // .replace() on a Date throws and would silently crash before a.click().
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.tid,
        r.item_description ?? '',
        r.damage_reason ?? '',
        r.damaged_by ?? '',
        r.damaged_at ? formatDateTime(r.damaged_at) : '',
      ]
        .map(escape)
        .join(',')
    ),
  ]
  return lines.join('\n')
}

export function CsvDownloadButton({ rows }: { rows: Row[] }) {
  function handleDownload() {
    const csv = toCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `damaged-items-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoking immediately races the browser actually reading the blob for the
    // download (most visible on Safari) — the download can silently never start.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-500"
    >
      Download CSV
    </button>
  )
}
