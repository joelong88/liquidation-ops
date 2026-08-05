'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/format-date'

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
  const palletRef = useRef<HTMLInputElement>(null)
  const sackRef = useRef<HTMLInputElement>(null)

  function pushEntry(code: string, status: LogEntry['status'], message: string) {
    setBanner({ ok: status === 'success', message })
    setLog((prev) => [{ id: logId++, sackCode: code, status, message }, ...prev].slice(0, 15))
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

    const supabase = createClient()
    const { data: sackRow, error: sackError } = await supabase
      .from('sack')
      .select('sack_id, status')
      .eq('sack_code', value)
      .eq('area', area)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sackError || !sackRow) {
      setBanner({ ok: false, message: `No ${areaLabel} sack with that code.` })
      setLooking(false)
      return
    }
    if (sackRow.status === 'OPEN') {
      setBanner({
        ok: false,
        message: `This sack is still open — close it at the ${areaLabel} inbound station first.`,
      })
      setLooking(false)
      return
    }
    if (!['CLOSED', 'STRIPPED'].includes(sackRow.status)) {
      setBanner({ ok: false, message: `Sack is already ${sackRow.status.toLowerCase()}.` })
      setLooking(false)
      return
    }

    const { data: parcels } = await supabase
      .from('parcel')
      .select('tid')
      .eq('sack_id', sackRow.sack_id)
      .order('tid')

    setPreview({
      sackCode: value,
      tids: (parcels ?? []).map((p) => p.tid),
      alreadyStripped: sackRow.status === 'STRIPPED',
    })
    setLooking(false)
  }

  async function handleConfirm() {
    if (!preview || pending) return
    setPending(true)

    const supabase = createClient()

    if (!preview.alreadyStripped) {
      const { data, error } = await supabase.rpc('strip_sack', {
        p_sack_code: preview.sackCode,
        p_area: area,
      })

      if (error) {
        pushEntry(preview.sackCode, 'error', error.message)
        setPreview(null)
        setSackCode('')
        setPending(false)
        sackRef.current?.focus()
        return
      }
      const result = data as { ok: boolean; error?: string; hold_until?: string }
      if (!result.ok) {
        const message =
          result.error === 'hold_not_matured'
            ? `Hold not matured until ${result.hold_until ? formatDateTime(result.hold_until) : 'unknown'}. Force-success below.`
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
        sackRef.current?.focus()
        return
      }
    }

    const { data: assignData, error: assignError } = await supabase.rpc('assign_pallet', {
      p_pallet_code: palletCode.trim(),
      p_sack_codes: [preview.sackCode],
    })

    if (assignError) {
      pushEntry(preview.sackCode, 'error', `Stripped, but pallet assignment failed: ${assignError.message}`)
    } else {
      const r = assignData as {
        ok: boolean
        error?: string
        added_sacks: string[]
        skipped: { sack_code?: string; reason: string }[]
      }
      if (!r.ok) {
        pushEntry(preview.sackCode, 'error', `Stripped, but pallet assignment failed: ${r.error ?? 'unknown error'}`)
      } else if (r.skipped.length > 0) {
        pushEntry(preview.sackCode, 'error', `Stripped, but not added to pallet: ${r.skipped[0].reason}`)
      } else {
        pushEntry(preview.sackCode, 'success', `Added to pallet ${palletCode.trim()}.`)
        router.refresh()
      }
    }

    setPreview(null)
    setSackCode('')
    setPending(false)
    sackRef.current?.focus()
  }

  async function handleClosePallet() {
    const value = palletCode.trim()
    if (!value || closingPallet) return
    setClosingPallet(true)

    const supabase = createClient()
    const { data, error } = await supabase.rpc('close_pallet', { p_pallet_code: value })

    if (error) {
      setBanner({ ok: false, message: error.message })
    } else {
      const result = data as { ok: boolean; error?: string }
      if (result.ok) {
        setBanner({ ok: true, message: `Pallet ${value} closed. Scan a new pallet ID for the next one.` })
        setPalletCode('')
      } else if (result.error === 'not_found') {
        setBanner({ ok: false, message: 'No assembling pallet with that code.' })
      } else if (result.error === 'already_closed') {
        setBanner({ ok: false, message: 'Already closed.' })
      } else {
        setBanner({ ok: false, message: result.error ?? 'Close failed.' })
      }
    }
    setClosingPallet(false)
    palletRef.current?.focus()
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
          <button
            type="button"
            onClick={handleClosePallet}
            disabled={!palletCode.trim() || closingPallet}
            className="whitespace-nowrap rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-40"
          >
            {closingPallet ? 'Closing…' : 'Close pallet'}
          </button>
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
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
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600"
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
