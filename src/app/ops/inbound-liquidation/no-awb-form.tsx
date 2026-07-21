'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function NoAwbForm() {
  const router = useRouter()
  const [cod, setCod] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(cod)
    if (!amount || amount <= 0 || pending) {
      setResult({ ok: false, message: 'Enter a value greater than zero.' })
      return
    }

    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('create_no_awb_parcel', { p_cod: amount })

    if (error) {
      setResult({ ok: false, message: error.message })
    } else {
      const r = data as { ok: boolean; error?: string; tid?: string }
      if (r.ok) {
        setResult({ ok: true, message: `Created ${r.tid} — now shows in the NO-AWB list below.` })
        setCod('')
        router.refresh()
      } else {
        setResult({ ok: false, message: r.error ?? 'Failed to create entry.' })
      }
    }
    setPending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="cod" className="text-sm font-medium text-neutral-700">
          No-barcode parcel — value (₱)
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
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Add entry'}
      </button>
      {result && (
        <p className={`text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>{result.message}</p>
      )}
    </form>
  )
}
