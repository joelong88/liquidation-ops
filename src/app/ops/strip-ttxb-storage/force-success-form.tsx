'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { callOpsApi } from '@/lib/ops/client'

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

    const result = await callOpsApi<{ ok: boolean; error?: string }>('force-sack-hold-success', {
      sack_code: sackCode,
      reason: reason.trim(),
    })

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
      <p className="text-xs font-medium text-amber-800">
        This bypasses the 7-day hold and is audited — are you sure?
      </p>
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
          {pending ? 'Working…' : 'Yes, force success'}
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
