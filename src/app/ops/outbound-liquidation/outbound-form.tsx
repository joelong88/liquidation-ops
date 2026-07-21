'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function OutboundForm() {
  const [palletCode, setPalletCode] = useState('')
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null)
  const palletRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = palletCode.trim()
    if (!value || pending) return

    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('record_pallet_outbound', { p_pallet_code: value })

    if (error) {
      setBanner({ ok: false, message: error.message })
    } else {
      const result = data as { ok: boolean; error?: string; status?: string }
      if (result.ok) {
        setBanner({ ok: true, message: 'Pallet exit recorded.' })
      } else if (result.error === 'not_found') {
        setBanner({ ok: false, message: 'No pallet with that code.' })
      } else if (result.error === 'not_sold') {
        setBanner({ ok: false, message: `Pallet isn't sold yet (status: ${result.status}).` })
      } else if (result.error === 'already_outgoing') {
        setBanner({ ok: false, message: 'Already recorded as outgoing.' })
      } else {
        setBanner({ ok: false, message: result.error ?? 'Failed.' })
      }
    }
    setPalletCode('')
    setPending(false)
    palletRef.current?.focus()
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label htmlFor="palletCode" className="text-sm font-medium text-neutral-700">
          Pallet ID
        </label>
        <input
          ref={palletRef}
          id="palletCode"
          value={palletCode}
          onChange={(e) => setPalletCode(e.target.value)}
          autoFocus
          autoComplete="off"
          disabled={pending}
          placeholder="Scan or type pallet ID, then Enter"
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
