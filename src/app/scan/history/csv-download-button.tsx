'use client'

import { formatDateTime } from '@/lib/format-date'

type Row = {
  level: 'TID' | 'Sack' | 'Pallet'
  idLabel: string
  scan: string
  result: string | null
  scannedByEmail: string | null
  eventTs: string | Date
}

function toCsv(rows: Row[]) {
  const header = ['Level', 'ID', 'Scan', 'Result', 'Scanned by', 'When (PHT)']
  // Values arrive as a mix of strings and (despite what the types say) native Date
  // objects — the DB layer returns DATETIME columns as Date, not string. escape()
  // must coerce defensively: calling .replace() directly on a Date throws, which
  // was silently crashing this function before it ever reached a.click().
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.level, r.idLabel, r.scan, r.result ?? '', r.scannedByEmail ?? '', formatDateTime(r.eventTs)]
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
    a.download = `recent-scans-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoking immediately races the browser actually reading the blob for the
    // download (most visible on Safari) — the download can silently never start.
    // A short delay lets it grab the data first.
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
