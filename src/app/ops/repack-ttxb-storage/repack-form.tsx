'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function RepackForm() {
  const [tid, setTid] = useState('')
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null)
  const tidRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = tid.trim()
    if (!value || pending) return

    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('repack_scan', { p_tid: value })

    if (error) {
      setBanner({ ok: false, message: error.message })
    } else {
      const result = data as { ok: boolean; error?: string; sack_id?: number }
      if (result.ok) {
        setBanner({ ok: true, message: 'Pulled for repack — rest of the sack unaffected.' })
      } else if (result.error === 'not_found') {
        setBanner({ ok: false, message: 'Unknown TID.' })
      } else if (result.error === 'not_in_open_sack') {
        setBanner({ ok: false, message: 'This TID isn’t in an open sack.' })
      } else if (result.error === 'sack_not_open_storage') {
        setBanner({ ok: false, message: 'This TID’s sack isn’t an open Storage sack.' })
      } else {
        setBanner({ ok: false, message: result.error ?? 'Repack failed.' })
      }
    }
    setTid('')
    setPending(false)
    tidRef.current?.focus()
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
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
