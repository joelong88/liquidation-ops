'use client'

import { useState } from 'react'

type Item = { tid: string; description: string | null; gmv: number }

function toCsv(palletCode: string, items: Item[]) {
  const header = ['Pallet Number', 'TID', 'Item Description', 'GMV']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [
    header.join(','),
    ...items.map((i) => [palletCode, i.tid, i.description ?? '', String(i.gmv)].map(escape).join(',')),
  ]
  return lines.join('\n')
}

export function PalletManifestRow({
  palletCode,
  status,
  gmv,
  items,
}: {
  palletCode: string
  status: string
  gmv: number
  items: Item[]
}) {
  const [expanded, setExpanded] = useState(false)

  function handleDownload() {
    const csv = toCsv(palletCode, items)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pallet-${palletCode}-manifest.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rounded-lg border border-neutral-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono font-semibold text-neutral-900">{palletCode}</span>
          <span className="ml-2 text-sm text-neutral-500">
            {status} · {items.length} TID{items.length === 1 ? '' : 's'} · ₱{gmv.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-500"
          >
            {expanded ? 'Hide manifest' : 'View manifest'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={items.length === 0}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-40"
          >
            Download CSV
          </button>
        </div>
      </div>
      {expanded && (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-100 uppercase tracking-wide text-neutral-500">
              <th className="py-1.5 pr-4">TID</th>
              <th className="py-1.5 pr-4">Item Description</th>
              <th className="py-1.5">GMV</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.tid} className="border-b border-neutral-50">
                <td className="py-1.5 pr-4 font-mono">{i.tid}</td>
                <td className="py-1.5 pr-4">{i.description ?? '—'}</td>
                <td className="py-1.5">₱{i.gmv.toLocaleString()}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="py-1.5 text-neutral-400">
                  No parcels on this pallet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
