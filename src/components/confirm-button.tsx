'use client'

import { useState } from 'react'

export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = 'Yes',
  pending = false,
  disabled = false,
  className,
}: {
  onConfirm: () => void
  label: string
  confirmLabel?: string
  pending?: boolean
  disabled?: boolean
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} disabled={disabled} className={className}>
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5">
      <span className="text-sm font-medium text-amber-900">Are you sure?</span>
      <button
        type="button"
        onClick={() => {
          setConfirming(false)
          onConfirm()
        }}
        disabled={pending}
        className="whitespace-nowrap rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Working…' : confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="whitespace-nowrap rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
      >
        Cancel
      </button>
    </div>
  )
}
