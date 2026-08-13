'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Location = {
  tid: string
  current_stage: string
  resolved_output_bin: string | null
  sack_code: string | null
  sack_area: string | null
  sack_status: string | null
  pallet_code: string | null
  pallet_status: string | null
}

export function TidLocationChecker() {
  const [tid, setTid] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Location | 'not_found' | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = tid.trim()
    if (!value || pending) return

    setPending(true)
    setResult(null)
    const supabase = createClient()
    const { data } = await supabase
      .from('parcel')
      .select(
        'tid, current_stage, resolved_output_bin, sack:sack_id(sack_code, area, status), pallet:pallet_id(pallet_code, status)'
      )
      .eq('tid', value)
      .maybeSingle()

    if (!data) {
      setResult('not_found')
    } else {
      const sack = data.sack as unknown as { sack_code: string; area: string; status: string } | null
      const pallet = data.pallet as unknown as { pallet_code: string; status: string } | null
      setResult({
        tid: data.tid,
        current_stage: data.current_stage,
        resolved_output_bin: data.resolved_output_bin,
        sack_code: sack?.sack_code ?? null,
        sack_area: sack?.area ?? null,
        sack_status: sack?.status ?? null,
        pallet_code: pallet?.pallet_code ?? null,
        pallet_status: pallet?.status ?? null,
      })
    }
    setPending(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="locateTid" className="text-sm font-medium text-neutral-700">
            Find a parcel — enter its TID
          </label>
          <input
            id="locateTid"
            value={tid}
            onChange={(e) => setTid(e.target.value)}
            autoComplete="off"
            maxLength={30}
            placeholder="e.g. WNJPH00920174771"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !tid.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Looking up…' : 'Locate'}
        </button>
      </form>

      {result === 'not_found' && (
        <p className="text-sm text-red-700">No parcel found with that TID.</p>
      )}

      {result && result !== 'not_found' && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="font-mono font-semibold text-neutral-900">{result.tid}</div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-neutral-700 sm:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-neutral-500">Stage</div>
              {result.current_stage}
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Bin</div>
              {result.resolved_output_bin ?? '—'}
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Sack</div>
              {result.sack_code ? `${result.sack_code} (${result.sack_area}, ${result.sack_status})` : '—'}
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Pallet</div>
              {result.pallet_code ? `${result.pallet_code} (${result.pallet_status})` : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
