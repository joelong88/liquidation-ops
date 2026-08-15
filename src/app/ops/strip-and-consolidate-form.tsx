'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { callOpsApi, getOpsApi } from '@/lib/ops/client'
import { formatDate } from '@/lib/format-date'
import { playScanSound } from '@/lib/play-scan-sound'

type Area = 'STORAGE' | 'LIQUIDATION'
type Preview = { sackCode: string; tids: string[]; alreadyStripped: boolean } | null
type LogEntry = { id: number; sackCode: string; status: 'success' | 'error'; message: string }
let logId = 0

const AREA_LABEL: Record<Area, string> = { STORAGE: 'TTXB Storage', LIQUIDATION: 'Liquidation Area' }

export function StripAndConsolidateForm({ area }: { area: Area }) {
  const router = useRouter()
  const areaLabel = AREA_LABEL[area]
  const [palletCode, setPalletCode] = useState('')
  const [closingPallet, setClosingPallet] = useState(false)
  const [sackCode, setSackCode] = useState('')
  const [preview, setPreview] = useState<Preview>(null)
  const [looking, setLooking] = useState(false)
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [confirmingClosePallet, setConfirmingClosePallet] = useState(false)
  const palletRef = useRef<HTMLInputElement>(null)
  const sackRef = useRef<HTMLInputElement>(null)

  function pushEntry(code: string, status: LogEntry['status'], message: string) {
    setBanner({ ok: status === 'success', message })
    setLog((prev) => [{ id: logId++, sackCode: code, status, message }, ...prev].slice(0, 15))
    playScanSound(status)
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    const value = sackCode.trim()
    if (!value || looking) return

    if (!palletCode.trim()) {
      setBanner({ ok: false, message: 'Scan or enter a pallet ID first.' })
      return
    }

    setLooking(true)
    setBanner(null)

    const result = await getOpsApi<{
      ok: boolean
      error?: string
      status?: string
      sack_code?: string
      tids?: string[]
      already_stripped?: boolean
    }>('sack-preview', { code: value, area })

    if (!result.ok) {
      const message =
        result.error === 'not_found'
          ? `No ${areaLabel} sack with that code.`
          : result.error === 'still_open'
            ? `This sack is still open — close it at the ${areaLabel} inbound station first.`
            : result.error === 'wrong_status'
              ? `Sack is already ${(result.status ?? '').toLowerCase()}.`
              : (result.error ?? 'Lookup failed.')
      setBanner({ ok: false, message })
      setLooking(false)
      return
    }

    setPreview({
      sackCode: value,
      tids: result.tids ?? [],
      alreadyStripped: Boolean(result.already_stripped),
    })
    setLooking(false)
  }

  async function handleConfirm() {
    if (!preview || pending) return
    setPending(true)

    if (!preview.alreadyStripped) {
      const result = await callOpsApi<{ ok: boolean; error?: string; hold_until?: string }>('strip-sack', {
        sack_code: preview.sackCode,
        area,
      })

      if (!result.ok) {
        const message =
          result.error === 'hold_not_matured'
            ? `7 days in TTXB storage only ends at ${result.hold_until ? formatDate(result.hold_until) : 'unknown'}. Force-success below.`
            : result.error === 'not_found'
              ? `No closed ${areaLabel} sack with that code.`
              : result.error === 'not_closed'
                ? 'This sack isn’t closed yet.'
                : result.error === 'already_stripped'
                  ? 'Already stripped — retry to consolidate onto the pallet.'
                  : (result.error ?? 'Strip failed.')
        pushEntry(preview.sackCode, 'error', message)
        setPreview(null)
        setSackCode('')
        setPending(false)
        setTimeout(() => sackRef.current?.focus(), 0)
        return
      }
    }

    const r = await callOpsApi<{
      ok: boolean
      error?: string
      added_sacks: string[]
      skipped: { sack_code?: string; reason: string }[]
    }>('assign-pallet', { pallet_code: palletCode.trim(), sack_codes: [preview.sackCode] })

    if (!r.ok) {
      pushEntry(preview.sackCode, 'error', `Stripped, but pallet assignment failed: ${r.error ?? 'unknown error'}`)
    } else if (r.skipped.length > 0) {
      pushEntry(preview.sackCode, 'error', `Stripped, but not added to pallet: ${r.skipped[0].reason}`)
    } else {
      pushEntry(preview.sackCode, 'success', `Added to pallet ${palletCode.trim()}.`)
      router.refresh()
    }

    setPreview(null)
    setSackCode('')
    setPending(false)
    setTimeout(() => sackRef.current?.focus(), 0)
  }

  async function handleClosePallet() {
    const value = palletCode.trim()
    if (!value || closingPallet) return
    setClosingPallet(true)
    setConfirmingClosePallet(false)

    const result = await callOpsApi<{ ok: boolean; error?: string }>('close-pallet', { pallet_code: value })

    if (result.ok) {
      setBanner({ ok: true, message: `Pallet ${value} closed. Scan a new pallet ID for the next one.` })
      setPalletCode('')
      playScanSound('success')
    } else if (result.error === 'not_found') {
      setBanner({ ok: false, message: 'No assembling pallet with that code.' })
      playScanSound('error')
    } else if (result.error === 'already_closed') {
      setBanner({ ok: false, message: 'Already closed.' })
      playScanSound('error')
    } else {
      setBanner({ ok: false, message: result.error ?? 'Close failed.' })
      playScanSound('error')
    }
    setClosingPallet(false)
    setTimeout(() => palletRef.current?.focus(), 0)
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="rounded-md border-2 border-neutral-300 bg-neutral-50 p-4">
        <label htmlFor="palletCode" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Current pallet (scan once, reuse for every sack below)
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            ref={palletRef}
            id="palletCode"
            value={palletCode}
            onChange={(e) => setPalletCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                sackRef.current?.focus()
              }
            }}
            autoComplete="off"
            placeholder="Scan or type pallet ID, then Enter"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-2xl font-bold font-mono focus:border-neutral-500 focus:outline-none"
          />
          {!confirmingClosePallet ? (
            <button
              type="button"
              onClick={() => setConfirmingClosePallet(true)}
              disabled={!palletCode.trim() || closingPallet}
              className="whitespace-nowrap rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-40"
            >
              Close pallet
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5">
              <span className="text-sm font-medium text-amber-900">Are you sure?</span>
              <button
                type="button"
                onClick={handleClosePallet}
                disabled={closingPallet}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {closingPallet ? 'Closing…' : 'Yes, close'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClosePallet(false)}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {!preview ? (
        <form onSubmit={handleLookup} className="flex flex-col gap-2">
          <label htmlFor="sackCode" className="text-sm font-medium text-neutral-700">
            Sack ID
          </label>
          <input
            ref={sackRef}
            id="sackCode"
            value={sackCode}
            onChange={(e) => setSackCode(e.target.value)}
            autoComplete="off"
            disabled={looking}
            placeholder="Scan or type sack ID, then Enter"
            className="rounded-md border border-neutral-300 px-3 py-3 text-lg font-mono focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
        </form>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4">
          <div>
            <div className="text-sm font-semibold text-amber-900">
              Sack <span className="font-mono">{preview.sackCode}</span> — {preview.tids.length}{' '}
              parcel(s){preview.alreadyStripped && ' — already stripped'}
            </div>
            <ul className="mt-1 max-h-40 overflow-y-auto rounded bg-white/60 p-2 text-xs font-mono">
              {preview.tids.map((t) => (
                <li key={t}>{t}</li>
              ))}
              {preview.tids.length === 0 && <li className="font-sans text-neutral-500">No parcels.</li>}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-amber-900">ARE YOU SURE?</span>
            <span className="text-xs text-amber-800">This can&apos;t be undone.</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="rounded-lg bg-green-600 px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
            >
              {pending
                ? 'Working…'
                : preview.alreadyStripped
                  ? `Yes, add to pallet ${palletCode.trim()}`
                  : `Yes, strip and add to pallet ${palletCode.trim()}`}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg bg-red-600 px-5 py-3 text-base font-semibold text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
          Sacks processed this session
        </h3>
        <ul className="flex flex-col gap-1">
          {log.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-1.5 text-xs"
            >
              <span className="font-mono">{entry.sackCode}</span>
              <span className={entry.status === 'success' ? 'text-green-700' : 'text-red-700'}>
                {entry.status}
              </span>
            </li>
          ))}
          {log.length === 0 && <li className="text-xs text-neutral-400">No sacks processed yet.</li>}
        </ul>
      </div>
    </div>
  )
}
