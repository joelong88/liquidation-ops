'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { callOpsApi } from '@/lib/ops/client'

const HEADER_ALIASES: Record<string, string> = {
  tid: 'tid',
  trackingid: 'tid',
  tracking_id: 'tid',
  trackingnumber: 'tid',
  status: 'granular_status',
  granularstatus: 'granular_status',
  granular_status: 'granular_status',
  parcelstatus: 'granular_status',
  codvalue: 'cod_value',
  cod_value: 'cod_value',
  cod: 'cod_value',
  goodsvalue: 'goods_value',
  goods_value: 'goods_value',
  goods: 'goods_value',
  value: 'goods_value',
  insurancevalue: 'insurance_value',
  insurance_value: 'insurance_value',
  insurance: 'insurance_value',
  xbvalue: 'xb_value_usd',
  xbvalueusd: 'xb_value_usd',
  xb_value_usd: 'xb_value_usd',
  xb: 'xb_value_usd',
  itemdescription: 'item_description',
  item_description: 'item_description',
  description: 'item_description',
  item: 'item_description',
  lastpetstype: 'pets_ticket_type',
  petstype: 'pets_ticket_type',
  pets_ticket_type: 'pets_ticket_type',
  tickettype: 'pets_ticket_type',
  ticket_type: 'pets_ticket_type',
  lastpetssubtype: 'pets_ticket_subtype',
  petssubtype: 'pets_ticket_subtype',
  pets_ticket_subtype: 'pets_ticket_subtype',
  ticketsubtype: 'pets_ticket_subtype',
  ticket_subtype: 'pets_ticket_subtype',
  subtype: 'pets_ticket_subtype',
  outcome: 'pets_ticket_outcome',
  orderoutcome: 'pets_ticket_outcome',
  order_outcome: 'pets_ticket_outcome',
  pets_ticket_outcome: 'pets_ticket_outcome',
  shippersegment: 'shipper_segment_raw',
  shipper_segment: 'shipper_segment_raw',
  segment: 'shipper_segment_raw',
  reporting_segment: 'shipper_segment_raw',
  reportingsegment: 'shipper_segment_raw',
  ticket_outcome: 'pets_ticket_outcome',
  ticketoutcome: 'pets_ticket_outcome',
  name: 'recovery_name',
  recoveryname: 'recovery_name',
  recovery_name: 'recovery_name',
  consignee_name: 'recovery_name',
  consigneename: 'recovery_name',
}

// Normalizes both the alias keys above and incoming CSV headers the same way, so
// "last_pets_type" (underscores) and "lastpetstype" (no separators) match the same
// alias regardless of which convention a given export uses — a real export file
// (2026-09) used underscore-separated headers exclusively and every one of them
// silently failed to match under the old whitespace-only normalization, leaving
// pets_ticket_type/subtype/outcome/shipper_segment_raw null for every imported row.
function normalizeHeaderKey(h: string) {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '')
}
const NORMALIZED_HEADER_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([k, v]) => [normalizeHeaderKey(k), v])
)

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  if (rows.length === 0) return []

  const headers = rows[0].map((h) => NORMALIZED_HEADER_ALIASES[normalizeHeaderKey(h)] ?? '')
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => {
        if (h) obj[h] = (r[idx] ?? '').trim()
      })
      return obj
    })
}

type Skipped = { row: unknown; reason: string }

export function CsvUploadForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: Skipped[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPending(true)
    setError(null)
    setResult(null)

    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length === 0) {
        setError('No data rows found — check the CSV has a header row (tid, status, cod_value, item_description).')
        setPending(false)
        return
      }
      if (!rows.some((r) => r.tid)) {
        setError('No "tid" column recognized in the header row.')
        setPending(false)
        return
      }

      const r = await callOpsApi<{ ok: boolean; error?: string; imported?: number; skipped?: Skipped[] }>(
        'import-csv',
        { rows }
      )

      if (!r.ok) {
        setError(r.error ?? 'Import failed.')
      } else {
        setResult({ imported: r.imported ?? 0, skipped: r.skipped ?? [] })
        router.refresh()
      }
    } catch {
      setError('Could not read that file as CSV.')
    }

    setPending(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-md border-2 border-neutral-300 bg-neutral-50 p-4">
      <div>
        <label htmlFor="csvFile" className="text-sm font-medium text-neutral-700">
          Upload CSV
        </label>
      </div>
      <input
        ref={fileRef}
        id="csvFile"
        type="file"
        accept=".csv,text/csv"
        disabled={pending}
        onChange={handleFile}
        className="text-sm file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:opacity-50"
      />

      {pending && <p className="text-sm text-neutral-500">Importing…</p>}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Imported {result.imported} row(s).
            {result.skipped.length > 0 && ` Skipped ${result.skipped.length}.`}
          </div>
          {result.skipped.length > 0 && (
            <ul className="max-h-32 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              {result.skipped.map((s, i) => (
                <li key={i}>{s.reason}: {JSON.stringify(s.row)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
