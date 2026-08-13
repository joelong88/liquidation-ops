'use client'

type Row = {
  level: 'TID' | 'Sack' | 'Pallet'
  idLabel: string
  scan: string
  result: string | null
  scannedByEmail: string | null
  eventTs: string
}

function toCsv(rows: Row[]) {
  const header = ['Level', 'ID', 'Scan', 'Result', 'Scanned by', 'When (SGT)']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.level, r.idLabel, r.scan, r.result ?? '', r.scannedByEmail ?? '', r.eventTs].map(escape).join(',')
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
    URL.revokeObjectURL(url)
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
