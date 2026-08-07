import { notFound } from 'next/navigation'
import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { RecordBidForm } from '@/app/recovery/batches/[batchId]/record-bid-form'
import { BackLink } from '@/components/back-link'

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  const profile = await requireRole(['recovery_team', 'finance_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const { data: batch } = await supabase
    .from('batch')
    .select('*')
    .eq('batch_id', Number(batchId))
    .single()

  if (!batch) notFound()

  const [{ data: parcels }, { data: pallets }, { data: sale }] = await Promise.all([
    supabase
      .from('parcel')
      .select('tid, pallet_id, item_type, effective_value, is_synthetic_tid')
      .eq('batch_id', batch.batch_id)
      .order('tid'),
    supabase
      .from('pallet')
      .select('pallet_id, pallet_code, status')
      .eq('batch_id', batch.batch_id)
      .order('pallet_code'),
    supabase.from('sale').select('*').eq('batch_id', batch.batch_id).maybeSingle(),
  ])

  // Ceiling = live sum of GMV (effective_value = COD or manual estimate) across this
  // batch's actual parcels, rather than the batch.ceiling_price column — that column
  // is only ever refreshed by recompute_batch_pricing (which also only sums cod_value,
  // missing manually-valued NO-AWB parcels) and can go stale.
  const totalTids = parcels?.length ?? 0
  const ceilingSum = (parcels ?? []).reduce((sum, p) => sum + (Number(p.effective_value) || 0), 0)
  const avgGmv = totalTids > 0 ? ceilingSum / totalTids : null
  const recoveryRate = sale && ceilingSum > 0 ? (sale.sale_amount / ceilingSum) * 100 : null

  // This batch is a bundle of pallets (plus, occasionally, direct NO-AWB TIDs that
  // have no sack/pallet at all) — group by pallet rather than listing every raw TID.
  const tidCountByPallet = new Map<number, number>()
  const gmvByPallet = new Map<number, number>()
  const noAwbParcels: typeof parcels = []
  for (const p of parcels ?? []) {
    if (p.pallet_id == null) {
      noAwbParcels.push(p)
      continue
    }
    tidCountByPallet.set(p.pallet_id, (tidCountByPallet.get(p.pallet_id) ?? 0) + 1)
    gmvByPallet.set(p.pallet_id, (gmvByPallet.get(p.pallet_id) ?? 0) + (Number(p.effective_value) || 0))
  }
  const palletRows = (pallets ?? []).map((pl) => ({
    ...pl,
    tidCount: tidCountByPallet.get(pl.pallet_id) ?? 0,
    gmv: gmvByPallet.get(pl.pallet_id) ?? 0,
  }))

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <div>
        <BackLink href="/recovery/batches" label="Sales" />
        <h1 className="text-lg font-semibold text-neutral-900">
          Batch {batch.batch_number} <span className="text-neutral-400">({batch.status})</span>
        </h1>
        <p className="text-sm text-neutral-500">
          {batch.batch_type} · {totalTids} parcels
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Ceiling price (sum GMV)</div>
          <div className="text-lg font-semibold">₱{ceilingSum.toLocaleString()}</div>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Total TIDs</div>
          <div className="text-lg font-semibold">{totalTids}</div>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Avg GMV / TID</div>
          <div className="text-lg font-semibold">
            {avgGmv != null ? `₱${avgGmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
          </div>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="text-xs uppercase text-neutral-500">Recovery rate</div>
          <div className="text-lg font-semibold">
            {recoveryRate != null ? `${recoveryRate.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {sale ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border-2 border-neutral-300 bg-neutral-50 p-3">
            <div className="text-xs uppercase text-neutral-500">Sold for</div>
            <div className="text-lg font-semibold">₱{Number(sale.sale_amount).toLocaleString()}</div>
          </div>
          <div className="rounded-md border border-neutral-200 p-3">
            <div className="text-xs uppercase text-neutral-500">Buyer</div>
            <div className="text-lg font-semibold">{sale.buyer_name}</div>
          </div>
          <div className="rounded-md border border-neutral-200 p-3">
            <div className="text-xs uppercase text-neutral-500">Payment</div>
            <div className="text-lg font-semibold">
              {sale.payment_status === 'PAID' ? 'Paid' : 'Pending'}
            </div>
          </div>
          <div className="rounded-md border border-neutral-200 p-3">
            <div className="text-xs uppercase text-neutral-500">Sale date</div>
            <div className="text-lg font-semibold">
              {sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '—'}
            </div>
          </div>
        </div>
      ) : (
        profile.role !== 'finance_team' && <RecordBidForm batchId={batch.batch_id} />
      )}

      <div>
        <h2 className="text-base font-semibold text-neutral-900">Pallets in this batch</h2>
        <p className="text-sm text-neutral-500">
          A batch bundles pallets (not individual TIDs) into one sale — see a pallet&apos;s own
          TID list on the Sales page&apos;s Pallets table.
        </p>
      </div>
      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 pr-4">Pallet</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">TIDs</th>
            <th className="py-2">GMV</th>
          </tr>
        </thead>
        <tbody>
          {palletRows.map((p) => (
            <tr key={p.pallet_id} className="border-b border-neutral-100">
              <td className="py-2 pr-4 font-mono">{p.pallet_code}</td>
              <td className="py-2 pr-4">{p.status}</td>
              <td className="py-2 pr-4">{p.tidCount}</td>
              <td className="py-2">₱{p.gmv.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {palletRows.length === 0 && (
        <p className="text-sm text-neutral-400">No pallets associated with this batch.</p>
      )}

      {noAwbParcels && noAwbParcels.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Direct NO-AWB TIDs (no pallet)
          </h3>
          <table className="w-full max-w-2xl text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">TID</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2">GMV</th>
              </tr>
            </thead>
            <tbody>
              {noAwbParcels.map((p) => (
                <tr key={p.tid} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 font-mono">{p.tid}</td>
                  <td className="py-2 pr-4">{p.item_type ?? '—'}</td>
                  <td className="py-2">
                    {p.effective_value != null ? `₱${Number(p.effective_value).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
