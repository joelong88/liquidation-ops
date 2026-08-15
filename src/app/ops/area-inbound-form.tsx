'use client'

import { useEffect, useRef, useState } from 'react'
import { callOpsApi, getOpsApi } from '@/lib/ops/client'
import { formatDateTime } from '@/lib/format-date'
import { playScanSound } from '@/lib/play-scan-sound'
import { ConfirmButton } from '@/components/confirm-button'

type LogEntry = { id: number; tid: string; status: 'success' | 'error'; message: string }
type ClosedSack = { sack_id: number; sack_code: string; closed_at: string; tid_count: number }
let logId = 0

export function AreaInboundForm({ area }: { area: 'STORAGE' | 'LIQUIDATION' }) {
  const [sackCode, setSackCode] = useState('')
  const [tid, setTid] = useState('')
  const [pending, setPending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [banner, setBanner] = useState<{ status: LogEntry['status']; message: string } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [sackTidCount, setSackTidCount] = useState<number | null>(null)
  const [closedToday, setClosedToday] = useState<ClosedSack[]>([])
  const sackRef = useRef<HTMLInputElement>(null)
  const tidRef = useRef<HTMLInputElement>(null)

  function pushEntry(t: string, status: LogEntry['status'], message: string) {
    setBanner({ status, message })
    setLog((prev) => [{ id: logId++, tid: t, status, message }, ...prev].slice(0, 15))
    playScanSound(status)
  }

  async function refreshSackCount(code: string) {
    if (!code) {
      setSackTidCount(null)
      return
    }
    const r = await getOpsApi<{ sack_id: number | null; tid_count: number | null }>('sack-status', { code })
    setSackTidCount(r.tid_count)
  }

  async function refreshClosedToday() {
    const r = await getOpsApi<{ sacks: ClosedSack[] }>('closed-today', { area })
    setClosedToday(r.sacks ?? [])
  }

  useEffect(() => {
    refreshClosedToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    refreshSackCount(sackCode.trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sackCode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tidValue = tid.trim()
    const sackValue = sackCode.trim()
    if (!tidValue || !sackValue || pending) return

    setPending(true)
    const result = await callOpsApi<{ ok: boolean; error?: string; sack_area?: string; sack_code?: string }>(
      'area-inbound-scan',
      { tid: tidValue, sack_code: sackValue, area }
    )

    if (result.ok) {
      pushEntry(tidValue, 'success', `Recorded into sack ${sackValue}.`)
      refreshSackCount(sackValue)
    } else if (result.error === 'not_first_scanned') {
      pushEntry(tidValue, 'error', 'This TID hasn’t been through First Scan yet.')
    } else if (result.error === 'already_in_sack') {
      pushEntry(tidValue, 'error', `Already assigned to sack ${result.sack_code ?? '(unknown)'}.`)
    } else if (result.error === 'area_mismatch') {
      pushEntry(tidValue, 'error', `Sack ${sackValue} is already open in ${result.sack_area}.`)
    } else {
      pushEntry(tidValue, 'error', result.error ?? 'Scan failed.')
    }

    setTid('')
    setPending(false)
    setTimeout(() => tidRef.current?.focus(), 0)
  }

  async function handleCloseSack() {
    const sackValue = sackCode.trim()
    if (!sackValue || closing) return
    setClosing(true)

    const result = await callOpsApi<{ ok: boolean; error?: string }>('close-sack', { sack_code: sackValue })

    if (result.ok) {
      pushEntry(sackValue, 'success', `Sack ${sackValue} closed. Scan a new sack ID for the next one.`)
      setSackCode('')
      setSackTidCount(null)
      refreshClosedToday()
    } else if (result.error === 'not_found') {
      pushEntry(sackValue, 'error', 'No open sack with that code.')
    } else if (result.error === 'already_closed') {
      pushEntry(sackValue, 'error', 'Already closed.')
    } else {
      pushEntry(sackValue, 'error', result.error ?? 'Close failed.')
    }
    setClosing(false)
    setTimeout(() => sackRef.current?.focus(), 0)
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex max-w-md flex-1 flex-col gap-4">
        <div className="rounded-md border-2 border-neutral-300 bg-neutral-50 p-4">
          <label htmlFor="sackCode" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Current sack (scan once, reuse for every TID below)
          </label>
          <div className="mt-1 flex items-center gap-2">
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
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-2xl font-bold font-mono focus:border-neutral-500 focus:outline-none"
            />
            <ConfirmButton
              onConfirm={handleCloseSack}
              label="Close sack"
              confirmLabel="Yes, close"
              pending={closing}
              disabled={!sackCode.trim() || closing}
              className="whitespace-nowrap rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-40"
            />
          </div>
          {sackTidCount != null && (
            <div className="mt-2 text-sm font-medium text-neutral-600">
              {sackTidCount} TID{sackTidCount === 1 ? '' : 's'} in this sack so far
            </div>
          )}
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
            maxLength={30}
            placeholder="Scan or type TID, then Enter"
            className="rounded-md border border-neutral-300 px-3 py-3 text-lg font-mono focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
        </form>

        {banner && (
          <div
            className={`rounded-md border-2 px-4 py-3 text-base font-medium ${
              banner.status === 'success'
                ? 'border-green-300 bg-green-50 text-green-900'
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

      <div className="w-full max-w-sm shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Sacks closed today
        </h3>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4">Sack</th>
              <th className="py-2 pr-4">TIDs</th>
              <th className="py-2">Closed at</th>
            </tr>
          </thead>
          <tbody>
            {closedToday.map((s) => (
              <tr key={s.sack_id} className="border-b border-neutral-100">
                <td className="py-2 pr-4 font-mono">{s.sack_code}</td>
                <td className="py-2 pr-4">{s.tid_count}</td>
                <td className="py-2">{formatDateTime(s.closed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {closedToday.length === 0 && (
          <p className="mt-2 text-xs text-neutral-400">No sacks closed yet today.</p>
        )}
      </div>
    </div>
  )
}
