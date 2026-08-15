'use client'

import { useRef, useState } from 'react'
import { callOpsApi } from '@/lib/ops/client'
import { playScanSound } from '@/lib/play-scan-sound'

export function OutboundForm() {
  const [palletCode, setPalletCode] = useState('')
  const [confirmingCode, setConfirmingCode] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null)
  const palletRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = palletCode.trim()
    if (!value || pending) return
    setConfirmingCode(value)
  }

  async function doSubmit() {
    const value = confirmingCode
    if (!value || pending) return
    setConfirmingCode(null)

    setPending(true)
    const result = await callOpsApi<{ ok: boolean; error?: string; status?: string }>('pallet-outbound', {
      pallet_code: value,
    })

    const ok = result.ok
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
    playScanSound(ok ? 'success' : 'error')
    setPalletCode('')
    setPending(false)
    setTimeout(() => palletRef.current?.focus(), 0)
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
          disabled={pending || confirmingCode != null}
          placeholder="Scan or type pallet ID, then Enter"
          className="rounded-md border border-neutral-300 px-3 py-3 text-lg font-mono focus:border-neutral-500 focus:outline-none disabled:opacity-50"
        />
      </form>
      {confirmingCode != null && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <span className="text-sm font-medium text-amber-900">
            Record pallet <span className="font-mono">{confirmingCode}</span> as outbound — are you sure?
          </span>
          <button
            type="button"
            onClick={doSubmit}
            disabled={pending}
            className="whitespace-nowrap rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Working…' : 'Yes, record exit'}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingCode(null)
              setPalletCode('')
              setTimeout(() => palletRef.current?.focus(), 0)
            }}
            className="whitespace-nowrap rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            Cancel
          </button>
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
