'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/format-date'

type Bin = { code: string; label: string; area: string | null; is_hvi: boolean }

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
  A: 'border-blue-400 bg-blue-50 text-blue-900',
  B: 'border-blue-300 bg-blue-50 text-blue-800',
  C: 'border-green-400 bg-green-50 text-green-900',
  D: 'border-green-300 bg-green-50 text-green-800',
  E: 'border-amber-400 bg-amber-50 text-amber-900',
  F: 'border-red-400 bg-red-50 text-red-900',
  G: 'border-purple-400 bg-purple-50 text-purple-900',
}

export function FirstScanForm({ bins }: { bins: Bin[] }) {
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
    const { data, error } = await supabase.rpc('record_first_scan', { p_tid: value })

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
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
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
            className="rounded-md border border-neutral-300 px-4 py-4 text-2xl font-mono focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
        </form>

        {result && (
          <div
            className={`flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-lg border-4 p-8 text-center ${
              result.ok ? BIN_COLORS[result.bin ?? 'F'] : 'border-red-400 bg-red-50 text-red-900'
            }`}
          >
            {!result.ok ? (
              <>
                <div className="text-lg font-semibold">
                  {result.error === 'duplicate'
                    ? 'Already first-scanned'
                    : (result.error ?? 'Scan failed')}
                </div>
                {result.error === 'duplicate' && result.event_ts && (
                  <div className="text-sm opacity-80">{formatDateTime(result.event_ts)}</div>
                )}
              </>
            ) : (
              <>
                <div className="font-mono text-4xl font-bold opacity-80">{scannedTid}</div>
                <div className="text-9xl font-black leading-none">{result.bin}</div>
                <div className="text-2xl font-semibold">{result.bin_label}</div>
                {result.area && <div className="text-base opacity-80">Carry to: {result.area}</div>}
                {result.is_hvi != null && (
                  <div className="text-base font-medium opacity-80">
                    {result.is_hvi ? 'HVI' : 'Non-HVI'}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-xs shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Bin reference
        </h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {bins.map((b) => (
            <li
              key={b.code}
              className={`rounded-md border px-3 py-2 text-sm ${BIN_COLORS[b.code] ?? 'border-neutral-200'}`}
            >
              <span className="font-bold">{b.code}</span> — {b.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
