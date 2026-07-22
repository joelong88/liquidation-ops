'use client'

type Row = {
  tid: string
  current_stage: string
  granular_status: string | null
  resolved_output_bin: string | null
  output_resolved_at: string | null
}

function toCsv(rows: Row[]) {
  const header = ['TID', 'Stage', 'Status', 'Output Bin', 'Flagged At']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.tid,
        r.current_stage,
        r.granular_status ?? '',
        r.resolved_output_bin ?? '',
        r.output_resolved_at ?? '',
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
    a.download = `force-success-list-${new Date().toISOString().slice(0, 10)}.csv`
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
