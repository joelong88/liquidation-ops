'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type LogEntry = { id: number; tid: string; status: 'success' | 'error'; message: string }
let logId = 0

export function AreaInboundForm({ area }: { area: 'STORAGE' | 'LIQUIDATION' }) {
  const [sackCode, setSackCode] = useState('')
  const [tid, setTid] = useState('')
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ status: LogEntry['status']; message: string } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const sackRef = useRef<HTMLInputElement>(null)
  const tidRef = useRef<HTMLInputElement>(null)

  function pushEntry(t: string, status: LogEntry['status'], message: string) {
    setBanner({ status, message })
    setLog((prev) => [{ id: logId++, tid: t, status, message }, ...prev].slice(0, 15))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tidValue = tid.trim()
    const sackValue = sackCode.trim()
    if (!tidValue || !sackValue || pending) return

    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('record_area_inbound_scan', {
      p_tid: tidValue,
      p_sack_code: sackValue,
      p_area: area,
    })

    if (error) {
      pushEntry(tidValue, 'error', error.message)
    } else {
      const result = data as { ok: boolean; error?: string; sack_area?: string; sack_id?: number }
      if (result.ok) {
        pushEntry(tidValue, 'success', `Recorded into sack ${sackValue}.`)
      } else if (result.error === 'not_first_scanned') {
        pushEntry(tidValue, 'error', 'This TID hasn’t been through First Scan yet.')
      } else if (result.error === 'already_in_sack') {
        pushEntry(tidValue, 'error', 'Already assigned to a sack.')
      } else if (result.error === 'area_mismatch') {
        pushEntry(tidValue, 'error', `Sack ${sackValue} is already open in ${result.sack_area}.`)
      } else {
        pushEntry(tidValue, 'error', result.error ?? 'Scan failed.')
      }
    }

    setTid('')
    setPending(false)
    tidRef.current?.focus()
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="sackCode" className="text-sm font-medium text-neutral-700">
          Sack ID (stays set — scan once, reuse for every TID below)
        </label>
        <input
          ref={sackRef}
          id="sackCode"
          value={sackCode}
          onChange={(e) => setSackCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              tidRef.current?.focus()
            }
          }}
          autoComplete="off"
          placeholder="Scan or type sack ID, then Enter"
          className="rounded-md border border-neutral-300 px-3 py-2 text-base font-mono focus:border-neutral-500 focus:outline-none"
        />
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

      {banner && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.status === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {banner.message}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Recent scans
        </h3>
        <ul className="flex flex-col gap-1">
          {log.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-1.5 text-xs"
            >
              <span className="font-mono">{entry.tid}</span>
              <span className={entry.status === 'success' ? 'text-green-700' : 'text-red-700'}>
                {entry.status}
              </span>
            </li>
          ))}
          {log.length === 0 && <li className="text-xs text-neutral-400">No scans yet.</li>}
        </ul>
      </div>
    </div>
  )
}
