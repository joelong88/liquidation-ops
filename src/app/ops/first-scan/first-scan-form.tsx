'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Category = { code: string; label: string }

type BinResult = {
  ok: boolean
  error?: string
  bin?: string
  bin_label?: string
  area?: string | null
  is_hvi?: boolean | null
  matched_rule?: number | null
  event_ts?: string
}

const BIN_COLORS: Record<string, string> = {
  A: 'border-blue-300 bg-blue-50 text-blue-900',
  B: 'border-blue-200 bg-blue-50 text-blue-800',
  C: 'border-green-300 bg-green-50 text-green-900',
  D: 'border-green-200 bg-green-50 text-green-800',
  E: 'border-amber-300 bg-amber-50 text-amber-900',
  F: 'border-red-300 bg-red-50 text-red-900',
  G: 'border-purple-300 bg-purple-50 text-purple-900',
}

export function FirstScanForm({ categories }: { categories: Category[] }) {
  const [category, setCategory] = useState('')
  const [tid, setTid] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<BinResult | null>(null)
  const [scannedTid, setScannedTid] = useState('')
  const tidRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = tid.trim()
    if (!value || pending) return

    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('record_first_scan', {
      p_tid: value,
      p_parcel_category: category || undefined,
    })

    if (error) {
      setResult({ ok: false, error: error.message })
    } else {
      setResult(data as BinResult)
    }
    setScannedTid(value)
    setTid('')
    setPending(false)
    tidRef.current?.focus()
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-sm font-medium text-neutral-700">
          Category (only needed for a brand-new TID)
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="tid" className="text-sm font-medium text-neutral-700">
          Tracking ID
        </label>
        <input
          ref={tidRef}
          id="tid"
          value={tid}
          onChange={(e) => setTid(e.target.value)}
          autoFocus
          autoComplete="off"
          disabled={pending}
          placeholder="Scan or type TID, then Enter"
          className="rounded-md border border-neutral-300 px-3 py-3 text-lg font-mono focus:border-neutral-500 focus:outline-none disabled:opacity-50"
        />
      </form>

      {result && (
        <div className="flex flex-col gap-2">
          {!result.ok ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {result.error === 'category_required'
                ? 'This TID needs a category — pick one and rescan.'
                : result.error === 'duplicate'
                  ? `Already first-scanned${result.event_ts ? ` at ${new Date(result.event_ts).toLocaleString()}` : ''}.`
                  : (result.error ?? 'Scan failed.')}
            </div>
          ) : (
            <div
              className={`rounded-md border-2 px-4 py-3 ${BIN_COLORS[result.bin ?? 'F']}`}
            >
              <div className="font-mono text-xs opacity-70">{scannedTid}</div>
              <div className="text-2xl font-bold">Bin {result.bin}</div>
              <div className="text-sm font-medium">{result.bin_label}</div>
              {result.area && <div className="text-xs opacity-80">Carry to: {result.area}</div>}
              {result.matched_rule == null && (
                <div className="mt-2 rounded bg-white/60 px-2 py-1 text-xs font-medium">
                  Unmapped — no routing rule matched yet. Flagged for manual review, not an
                  error with this scan.
                </div>
              )}
              {result.is_hvi != null && (
                <div className="text-xs opacity-80">{result.is_hvi ? 'HVI' : 'Non-HVI'}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
