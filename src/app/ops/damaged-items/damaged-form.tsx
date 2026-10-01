'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { callOpsApi } from '@/lib/ops/client'
import { playScanSound } from '@/lib/play-scan-sound'

type LogEntry = { id: number; tid: string; status: 'success' | 'error'; message: string }
let logId = 0

const REASON_PRESETS = ['Damaged', 'Leaking', 'Other']

export function DamagedForm() {
  const router = useRouter()
  const [tid, setTid] = useState('')
  const [reason, setReason] = useState('Damaged')
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const tidRef = useRef<HTMLInputElement>(null)

  function pushEntry(t: string, status: LogEntry['status'], message: string) {
    setLog((prev) => [{ id: logId++, tid: t, status, message }, ...prev].slice(0, 15))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = tid.trim()
    if (!value || pending) return

    setPending(true)
    const result = await callOpsApi<{ ok: boolean; error?: string; status?: string }>('damaged-scan', {
      tid: value,
      reason: reason.trim() || null,
    })

    let message: string
    const ok = result.ok
    if (result.ok) {
      message = 'Marked damaged — pulled out of its sack, excluded from pallet/sale.'
      router.refresh()
    } else if (result.error === 'not_found') {
      message = 'Unknown TID.'
    } else if (result.error === 'not_in_sack') {
      message = 'This TID isn’t currently in a sack.'
    } else if (result.error === 'sack_not_closed') {
      message = `This TID’s sack isn’t closed (status: ${result.status ?? 'unknown'}) — close it first.`
    } else {
      message = result.error ?? 'Scan failed.'
    }

    setBanner({ ok, message })
    pushEntry(value, ok ? 'success' : 'error', message)
    playScanSound(ok ? 'success' : 'error')
    setTid('')
    setPending(false)
    setTimeout(() => tidRef.current?.focus(), 0)
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
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
            readOnly={pending}
            maxLength={30}
            placeholder="Scan or type TID, then Enter"
            className={`rounded-md border border-neutral-300 px-3 py-3 text-lg font-mono focus:border-neutral-500 focus:outline-none ${pending ? 'opacity-50' : ''}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-neutral-700">Reason</span>
          <div className="flex gap-1.5">
            {REASON_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  reason === r
                    ? 'border-red-400 bg-red-50 text-red-800'
                    : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </form>
      {banner && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            banner.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {banner.message}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          TIDs scanned this session ({log.length})
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
