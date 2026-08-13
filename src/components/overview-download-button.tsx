'use client'

type Section = { title: string; headers: string[]; rows: (string | number)[][] }

// A real multi-sheet workbook would need an xlsx library — the only npm-published
// one (xlsx/SheetJS) has unpatched high-severity CVEs (prototype pollution + ReDoS),
// so this ships as one CSV with clearly divided "## Section" blocks instead.
function toCsv(sections: Section[]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const blocks = sections.map((s) => {
    const lines = [`## ${s.title}`, s.headers.map(escape).join(','), ...s.rows.map((r) => r.map(escape).join(','))]
    return lines.join('\n')
  })
  return blocks.join('\n\n')
}

export function OverviewDownloadButton({ sections }: { sections: Section[] }) {
  function handleDownload() {
    const csv = toCsv(sections)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `overview-export-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
    >
      Download all data (CSV)
    </button>
  )
}
