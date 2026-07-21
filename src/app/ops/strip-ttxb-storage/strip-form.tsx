'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function StripForm() {
  const router = useRouter()
  const [sackCode, setSackCode] = useState('')
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null)
  const sackRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = sackCode.trim()
    if (!value || pending) return

    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('strip_sack', { p_sack_code: value, p_area: 'STORAGE' })

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
        setBanner({ ok: false, message: 'No open Storage sack with that code.' })
      } else if (result.error === 'hold_not_matured') {
        const until = result.hold_until ? new Date(result.hold_until).toLocaleString() : 'unknown'
        setBanner({ ok: false, message: `Hold not matured until ${until}. Force-success below.` })
      } else if (result.error === 'already_stripped') {
        setBanner({ ok: false, message: 'Already stripped.' })
      } else {
        setBanner({ ok: false, message: result.error ?? 'Strip failed.' })
      }
    }
    setSackCode('')
    setPending(false)
    sackRef.current?.focus()
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
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
          disabled={pending}
          placeholder="Scan or type sack ID, then Enter"
          className="rounded-md border border-neutral-300 px-3 py-3 text-lg font-mono focus:border-neutral-500 focus:outline-none disabled:opacity-50"
        />
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
    </div>
  )
}
