import Link from 'next/link'
import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { SellPalletsForm } from '@/app/recovery/batches/sell-pallets-form'
import { BackToDashboard } from '@/components/back-to-dashboard'

export default async function BatchesPage() {
  const profile = await requireRole(['recovery_team', 'finance_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const [{ data: batches }, { data: endorsedPallets }, { data: allPallets }, { data: palletParcels }, { data: batchParcels }, { data: sales }] =
    await Promise.all([
      supabase
        .from('batch')
        .select('batch_id, batch_number, batch_type, status, ceiling_price, floor_price, month, parcel(count)')
        .order('batch_number', { ascending: false }),
      supabase
        .from('pallet')
        .select('pallet_id, pallet_code')
        .eq('status', 'ENDORSED')
        .is('batch_id', null)
        .order('endorsed_at', { ascending: true }),
      supabase
        .from('pallet')
        .select('pallet_id, pallet_code, status, batch_id, assembled_at, endorsed_at, outgoing_at')
        .order('assembled_at', { ascending: false }),
      supabase.from('parcel').select('pallet_id, effective_value').not('pallet_id', 'is', null),
      supabase.from('parcel').select('batch_id, effective_value').not('batch_id', 'is', null),
      supabase.from('sale').select('batch_id, sale_amount, payment_status').not('batch_id', 'is', null),
    ])

  const tidCountByPallet = new Map<number, number>()
  const gmvByPallet = new Map<number, number>()
  for (const p of palletParcels ?? []) {
    if (p.pallet_id == null) continue
    tidCountByPallet.set(p.pallet_id, (tidCountByPallet.get(p.pallet_id) ?? 0) + 1)
    gmvByPallet.set(p.pallet_id, (gmvByPallet.get(p.pallet_id) ?? 0) + (Number(p.effective_value) || 0))
  }

  const gmvByBatch = new Map<number, number>()
  for (const p of batchParcels ?? []) {
    if (p.batch_id == null) continue
    gmvByBatch.set(p.batch_id, (gmvByBatch.get(p.batch_id) ?? 0) + (Number(p.effective_value) || 0))
  }

  const saleByBatch = new Map<number, { sale_amount: number; payment_status: string }>()
  for (const s of sales ?? []) {
    if (s.batch_id == null) continue
    saleByBatch.set(s.batch_id, { sale_amount: Number(s.sale_amount), payment_status: s.payment_status })
  }

  const batchNumberById = new Map<number, number>()
  for (const b of batches ?? []) {
    batchNumberById.set(b.batch_id, b.batch_number)
  }

  const palletRows = (allPallets ?? [])
    .map((p) => {
      const sale = p.batch_id != null ? saleByBatch.get(p.batch_id) : undefined
      const batchGmv = p.batch_id != null ? gmvByBatch.get(p.batch_id) : undefined
      const recoveryRate = sale && batchGmv ? (sale.sale_amount / batchGmv) * 100 : null
      return {
        pallet_id: p.pallet_id,
        pallet_code: p.pallet_code,
        status: p.status,
        batch_id: p.batch_id,
        batch_number: p.batch_id != null ? batchNumberById.get(p.batch_id) : null,
        tidCount: tidCountByPallet.get(p.pallet_id) ?? 0,
        gmv: gmvByPallet.get(p.pallet_id) ?? 0,
        endorsed: p.endorsed_at != null,
        sale,
        recoveryRate,
        outbound: p.outgoing_at != null,
      }
    })
    // Group pallets sharing a batch/sale next to each other, so it's visually obvious
    // e.g. Batch 1 covers pallets A, B, and C — rather than that link only being
    // discoverable by cross-referencing the Batch column one row at a time.
    .sort((a, b) => {
      const an = a.batch_number ?? Infinity
      const bn = b.batch_number ?? Infinity
      if (an !== bn) return an - bn
      return a.pallet_code.localeCompare(b.pallet_code)
    })

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <BackToDashboard />
      <h1 className="text-lg font-semibold text-neutral-900">Batches</h1>
      {profile.role !== 'finance_team' && <SellPalletsForm pallets={endorsedPallets ?? []} />}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">Batch</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Parcels</th>
            <th className="py-2 pr-4">Ceiling</th>
            <th className="py-2">Floor</th>
          </tr>
        </thead>
        <tbody>
          {batches?.map((b) => (
            <tr key={b.batch_id} className="border-b border-neutral-100">
              <td className="py-2 pr-4">
                <Link
                  href={`/recovery/batches/${b.batch_id}`}
                  className="font-medium text-neutral-900 underline"
                >
                  Batch {b.batch_number}
                </Link>
              </td>
              <td className="py-2 pr-4">{b.batch_type}</td>
              <td className="py-2 pr-4">{b.status}</td>
              <td className="py-2 pr-4">{b.parcel?.[0]?.count ?? 0}</td>
              <td className="py-2 pr-4">
                {b.ceiling_price != null ? `₱${Number(b.ceiling_price).toLocaleString()}` : '—'}
              </td>
              <td className="py-2">
                {b.floor_price != null ? `₱${Number(b.floor_price).toLocaleString()}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {batches?.length === 0 && <p className="text-sm text-neutral-400">No batches yet.</p>}

      <div>
        <h2 className="text-base font-semibold text-neutral-900">Pallets</h2>
        <p className="text-sm text-neutral-500">
          Every pallet assembled from stripped sacks — TID count and GMV are this pallet&apos;s
          own; recovery % is the pallet&apos;s batch-wide rate (a batch can bundle several
          pallets into one sale, so recovery is only meaningful at that level).
        </p>
      </div>
      <table className="w-full max-w-4xl text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">Pallet</th>
            <th className="py-2 pr-4">Batch</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">TIDs</th>
            <th className="py-2 pr-4">GMV</th>
            <th className="py-2 pr-4">Endorsed</th>
            <th className="py-2 pr-4">Sold for</th>
            <th className="py-2 pr-4">Recovery %</th>
            <th className="py-2">Outbound</th>
          </tr>
        </thead>
        <tbody>
          {palletRows.map((p) => (
            <tr key={p.pallet_id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono">{p.pallet_code}</td>
              <td className="py-2 pr-4">
                {p.batch_id != null ? (
                  <Link href={`/recovery/batches/${p.batch_id}`} className="font-medium text-neutral-900 underline">
                    Batch {p.batch_number}
                  </Link>
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </td>
              <td className="py-2 pr-4">{p.status}</td>
              <td className="py-2 pr-4">{p.tidCount}</td>
              <td className="py-2 pr-4">₱{p.gmv.toLocaleString()}</td>
              <td className="py-2 pr-4">{p.endorsed ? 'Yes' : 'No'}</td>
              <td className="py-2 pr-4">
                {p.sale ? `₱${p.sale.sale_amount.toLocaleString()}` : '—'}
              </td>
              <td className="py-2 pr-4">
                {p.recoveryRate != null ? `${p.recoveryRate.toFixed(1)}%` : '—'}
              </td>
              <td className="py-2">{p.outbound ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {palletRows.length === 0 && <p className="text-sm text-neutral-400">No pallets yet.</p>}
    </main>
  )
}
