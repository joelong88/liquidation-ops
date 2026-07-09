'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function RecordBidForm({ batchId }: { batchId: number }) {
  const router = useRouter()
  const [buyerName, setBuyerName] = useState('')
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { data, error: rpcError } = await supabase.rpc('record_batch_sale', {
      p_batch_id: batchId,
      p_buyer_name: buyerName,
      p_sale_amount: Number(amount),
    })

    if (rpcError) {
      setError(rpcError.message)
    } else {
      const r = data as { ok: boolean; error?: string }
      if (r.ok) {
        router.refresh()
      } else {
        setError(r.error ?? 'Failed to record sale.')
      }
    }
    setPending(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-md border border-neutral-200 p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="buyer" className="text-sm font-medium text-neutral-700">
          Winning buyer
        </label>
        <input
          id="buyer"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="amount" className="text-sm font-medium text-neutral-700">
          Bid amount (₱)
        </label>
        <input
          id="amount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Recording…' : 'Record winning bid'}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}
