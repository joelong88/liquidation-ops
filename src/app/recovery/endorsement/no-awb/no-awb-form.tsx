'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type OpenBatch = { batch_id: number; batch_number: number; batch_type: string }

export function NoAwbForm({ openBatches }: { openBatches: OpenBatch[] }) {
  const [cod, setCod] = useState('')
  const [palletCode, setPalletCode] = useState('')
  const [batchChoice, setBatchChoice] = useState('new')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(cod)
    if (!amount || amount <= 0 || pending) {
      setResult({ ok: false, message: 'Enter a COD amount greater than zero.' })
      return
    }

    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('create_no_awb_parcel', {
      p_cod: amount,
      p_batch_id: batchChoice === 'new' ? undefined : Number(batchChoice),
      p_pallet_code: palletCode || undefined,
    })

    if (error) {
      setResult({ ok: false, message: error.message })
    } else {
      const r = data as { ok: boolean; error?: string; tid?: string; batch_id?: number }
      if (r.ok) {
        setResult({ ok: true, message: `Created ${r.tid} in batch #${r.batch_id}.` })
        setCod('')
        setPalletCode('')
      } else {
        setResult({ ok: false, message: r.error ?? 'Failed to create entry.' })
      }
    }
    setPending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="cod" className="text-sm font-medium text-neutral-700">
          COD amount (₱)
        </label>
        <input
          id="cod"
          type="number"
          min="0.01"
          step="0.01"
          value={cod}
          onChange={(e) => setCod(e.target.value)}
          required
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pallet" className="text-sm font-medium text-neutral-700">
          Pallet code (optional)
        </label>
        <input
          id="pallet"
          value={palletCode}
          onChange={(e) => setPalletCode(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="batch" className="text-sm font-medium text-neutral-700">
          Batch
        </label>
        <select
          id="batch"
          value={batchChoice}
          onChange={(e) => setBatchChoice(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="new">Create new batch</option>
          {openBatches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              Batch {b.batch_number} ({b.batch_type})
            </option>
          ))}
        </select>
      </div>

      {result && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            result.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {result.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Add entry'}
      </button>
    </form>
  )
}
