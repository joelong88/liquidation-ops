'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Preview = { sackCode: string; tids: string[] } | null

export function StripForm() {
  const router = useRouter()
  const [sackCode, setSackCode] = useState('')
  const [preview, setPreview] = useState<Preview>(null)
  const [looking, setLooking] = useState(false)
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null)
  const sackRef = useRef<HTMLInputElement>(null)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    const value = sackCode.trim()
    if (!value || looking) return
    setLooking(true)
    setBanner(null)

    const supabase = createClient()
    const { data: sackRow, error: sackError } = await supabase
      .from('sack')
      .select('sack_id')
      .eq('sack_code', value)
      .eq('area', 'STORAGE')
      .eq('status', 'CLOSED')
      .maybeSingle()

    if (sackError || !sackRow) {
      setBanner({ ok: false, message: 'No closed Storage sack with that code — close it first.' })
      setPreview(null)
      setLooking(false)
      return
    }

    const { data: parcels } = await supabase
      .from('parcel')
      .select('tid')
      .eq('sack_id', sackRow.sack_id)
      .order('tid')

    setPreview({ sackCode: value, tids: (parcels ?? []).map((p) => p.tid) })
    setLooking(false)
  }

  async function handleConfirmStrip() {
    if (!preview || pending) return
    setPending(true)

    const supabase = createClient()
    const { data, error } = await supabase.rpc('strip_sack', {
      p_sack_code: preview.sackCode,
      p_area: 'STORAGE',
    })

    if (error) {
      setBanner({ ok: false, message: error.message })
    } else {
      const result = data as {
        ok: boolean
        error?: string
        hold_until?: string
        parcels_advanced?: number
      }
      if (result.ok) {
        setBanner({ ok: true, message: `Stripped — ${result.parcels_advanced} parcel(s) advanced.` })
        router.refresh()
      } else if (result.error === 'not_found') {
        setBanner({ ok: false, message: 'No closed Storage sack with that code.' })
      } else if (result.error === 'not_closed') {
        setBanner({ ok: false, message: 'This sack isn’t closed yet.' })
      } else if (result.error === 'hold_not_matured') {
        const until = result.hold_until ? new Date(result.hold_until).toLocaleString() : 'unknown'
        setBanner({ ok: false, message: `Hold not matured until ${until}. Force-success below.` })
      } else if (result.error === 'already_stripped') {
        setBanner({ ok: false, message: 'Already stripped.' })
      } else {
        setBanner({ ok: false, message: result.error ?? 'Strip failed.' })
      }
    }
    setPreview(null)
    setSackCode('')
    setPending(false)
    sackRef.current?.focus()
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
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
            autoFocus
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
              parcel(s)
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
              onClick={handleConfirmStrip}
              disabled={pending}
              className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Stripping…' : 'Yes, strip this sack'}
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
    </div>
  )
}
