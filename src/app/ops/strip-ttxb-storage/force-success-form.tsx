'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function ForceSuccessForm({ sackCode }: { sackCode: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason.trim() || pending) return
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('force_sack_hold_success', {
      p_sack_code: sackCode,
      p_reason: reason.trim(),
    })

    if (rpcError) {
      setError(rpcError.message)
      setPending(false)
      return
    }

    const result = data as { ok: boolean; error?: string }
    if (!result.ok) {
      setError(result.error ?? 'Failed.')
      setPending(false)
      return
    }

    setOpen(false)
    setReason('')
    setPending(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-800 hover:border-amber-500"
      >
        Force success…
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        autoFocus
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={pending || !reason.trim()}
          className="rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  )
}
