import Link from 'next/link'
import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { SellPalletsForm } from '@/app/recovery/batches/sell-pallets-form'

export default async function BatchesPage() {
  const profile = await requireRole(['recovery_team', 'finance_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()
  const [{ data: batches }, { data: endorsedPallets }] = await Promise.all([
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
  ])

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
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
    </main>
  )
}
