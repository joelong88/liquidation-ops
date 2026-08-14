import { notFound } from 'next/navigation'
import { requireRole, AccessRestricted } from '@/lib/auth/role-gate'
import { createClient } from '@/lib/supabase/server'
import { RecordBidForm } from '@/app/recovery/batches/[batchId]/record-bid-form'
import { BackLink } from '@/components/back-link'
import { OverviewCanvas, Card, CardHeader, StatCard } from '@/components/overview-ui'

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
    <main className="min-h-screen p-6">
      <OverviewCanvas>
        <div>
          <BackLink href="/recovery/batches" label="Pallets for Sale" />
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">
            Batch {batch.batch_number} <span className="text-neutral-400">({batch.status})</span>
          </h1>
          <p className="text-sm text-neutral-500">
            {batch.batch_type} · {totalTids} parcels
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Ceiling price (sum GMV)" value={`₱${ceilingSum.toLocaleString()}`} accentDot="bg-red-600" />
          <StatCard label="Total TIDs" value={String(totalTids)} />
          <StatCard
            label="Avg GMV / TID"
            value={avgGmv != null ? `₱${avgGmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
          />
          <StatCard
            label="Recovery rate"
            value={recoveryRate != null ? `${recoveryRate.toFixed(1)}%` : '—'}
            accentDot="bg-emerald-600"
          />
        </div>

        {sale ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Sold for" value={`₱${Number(sale.sale_amount).toLocaleString()}`} accentDot="bg-red-600" />
            <StatCard label="Buyer" value={sale.buyer_name ?? '—'} />
            <StatCard label="Payment" value={sale.payment_status === 'PAID' ? 'Paid' : 'Pending'} />
            <StatCard
              label="Sale date"
              value={sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '—'}
            />
          </div>
        ) : (
          profile.role !== 'finance_team' && (
            <Card>
              <RecordBidForm batchId={batch.batch_id} />
            </Card>
          )
        )}

        <Card>
          <CardHeader
            title="Pallets in this batch"
            subtitle="TID list per pallet is on the Pallets for Sale page's Pallets table"
          />
          <table className="mt-2 w-full max-w-2xl text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Pallet</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">TIDs</th>
                <th className="py-2">GMV</th>
              </tr>
            </thead>
            <tbody>
              {palletRows.map((p) => (
                <tr key={p.pallet_id} className="border-b border-neutral-50">
                  <td className="py-2 pr-4 font-mono">{p.pallet_code}</td>
                  <td className="py-2 pr-4">{p.status}</td>
                  <td className="py-2 pr-4">{p.tidCount}</td>
                  <td className="py-2">₱{p.gmv.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {palletRows.length === 0 && (
            <p className="mt-2 text-sm text-neutral-400">No pallets associated with this batch.</p>
          )}
        </Card>

        {noAwbParcels && noAwbParcels.length > 0 && (
          <Card>
            <CardHeader title="Direct NO-AWB TIDs" subtitle="no pallet" />
            <table className="mt-2 w-full max-w-2xl text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-4">TID</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2">GMV</th>
                </tr>
              </thead>
              <tbody>
                {noAwbParcels.map((p) => (
                  <tr key={p.tid} className="border-b border-neutral-50">
                    <td className="py-2 pr-4 font-mono">{p.tid}</td>
                    <td className="py-2 pr-4">{p.item_type ?? '—'}</td>
                    <td className="py-2">
                      {p.effective_value != null ? `₱${Number(p.effective_value).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </OverviewCanvas>
    </main>
  )
}
