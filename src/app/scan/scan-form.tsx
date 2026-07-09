'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Stations are the app's fixed set of scan gates (RECEIVED/STAMPED/IN_STORAGE/OUTGOING) —
// hardcoded here rather than fetched from ref_stage, unlike ref_shipper_segment.hold_days
// which genuinely is business-configurable data. These four are a fixed feature of the
// workflow, not something ops would reconfigure without a code change anyway.
const STATIONS = [
  { code: 'RECEIVED', label: 'Incoming' },
  { code: 'STAMPED', label: 'NV Stamp' },
  { code: 'IN_STORAGE', label: 'In Storage' },
  { code: 'OUTGOING', label: 'Outgoing' },
] as const

type StationCode = (typeof STATIONS)[number]['code']

type Category = { code: string; label: string }

type LogEntry = {
  id: number
  tid: string
  station: string
  status: 'success' | 'duplicate' | 'error'
  message: string
  at: Date
}

let logId = 0

export function ScanForm({ categories }: { categories: Category[] }) {
  const [station, setStation] = useState<StationCode>('RECEIVED')
  const [category, setCategory] = useState('')
  const [tid, setTid] = useState('')
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ status: LogEntry['status']; message: string } | null>(
    null
  )
  const [log, setLog] = useState<LogEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = tid.trim()
    if (!value || pending) return
    if (station === 'RECEIVED' && !category) {
      setBanner({ status: 'error', message: 'Pick a category before scanning at Incoming.' })
      return
    }

    setPending(true)
    const supabase = createClient()
    const stationLabel = STATIONS.find((s) => s.code === station)!.label

    const { data, error } = await supabase.rpc('record_scan_event', {
      p_tid: value,
      p_stage: station,
      p_parcel_category: station === 'RECEIVED' ? category : undefined,
      p_station: stationLabel,
    })

    let entry: LogEntry
    if (error) {
      entry = {
        id: logId++,
        tid: value,
        station: stationLabel,
        status: 'error',
        message: error.message,
        at: new Date(),
      }
    } else {
      const result = data as {
        ok: boolean
        error?: string
        event_ts?: string
      }
      if (result.ok) {
        entry = {
          id: logId++,
          tid: value,
          station: stationLabel,
          status: 'success',
          message: `Recorded at ${stationLabel}.`,
          at: new Date(),
        }
      } else if (result.error === 'duplicate') {
        const when = result.event_ts ? new Date(result.event_ts).toLocaleString() : 'earlier'
        entry = {
          id: logId++,
          tid: value,
          station: stationLabel,
          status: 'duplicate',
          message: `Already scanned at ${stationLabel} (${when}).`,
          at: new Date(),
        }
      } else if (result.error === 'not_found') {
        entry = {
          id: logId++,
          tid: value,
          station: stationLabel,
          status: 'error',
          message: 'Unknown TID — scan it at Incoming first.',
          at: new Date(),
        }
      } else if (result.error === 'category_required') {
        entry = {
          id: logId++,
          tid: value,
          station: stationLabel,
          status: 'error',
          message: 'This TID needs a category — pick one and rescan.',
          at: new Date(),
        }
      } else {
        entry = {
          id: logId++,
          tid: value,
          station: stationLabel,
          status: 'error',
          message: result.error ?? 'Scan failed.',
          at: new Date(),
        }
      }
    }

    setBanner({ status: entry.status, message: entry.message })
    setLog((prev) => [entry, ...prev].slice(0, 15))
    setTid('')
    setPending(false)
    inputRef.current?.focus()
  }

  const bannerClass =
    banner?.status === 'success'
      ? 'bg-green-50 text-green-800 border-green-200'
      : banner?.status === 'duplicate'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-red-50 text-red-800 border-red-200'

  return (
    <div className="flex max-w-md flex-col gap-5">
      <div className="flex gap-2">
        {STATIONS.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => {
              setStation(s.code)
              inputRef.current?.focus()
            }}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              station === s.code
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 text-neutral-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {station === 'RECEIVED' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-sm font-medium text-neutral-700">
            Category
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
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="tid" className="text-sm font-medium text-neutral-700">
          Tracking ID
        </label>
        <input
          ref={inputRef}
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
        <div className={`rounded-md border px-3 py-2 text-sm ${bannerClass}`}>
          {banner.message}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Recent scans
        </h2>
        <ul className="flex flex-col gap-1">
          {log.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-1.5 text-xs"
            >
              <span className="font-mono">{entry.tid}</span>
              <span
                className={
                  entry.status === 'success'
                    ? 'text-green-700'
                    : entry.status === 'duplicate'
                      ? 'text-amber-700'
                      : 'text-red-700'
                }
              >
                {entry.station}
              </span>
            </li>
          ))}
          {log.length === 0 && <li className="text-xs text-neutral-400">No scans yet.</li>}
        </ul>
      </div>
    </div>
  )
}
