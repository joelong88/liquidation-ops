import Link from 'next/link'
import { requireRole, AccessRestricted } from '@/lib/supabase/role-gate'
import { createClient } from '@/lib/supabase/server'
import { EndorsementForm } from '@/app/recovery/endorsement/endorsement-form'
import { serverNow } from '@/lib/now'

export default async function EndorsementPage() {
  const profile = await requireRole(['recovery_team', 'owner'])
  if (!profile) return <AccessRestricted />

  const supabase = await createClient()

  const { data: parcels } = await supabase
    .from('parcel')
    .select('tid, item_type, cod_value, current_stage, shipper_segment, hold_until, hold_forced_success')
    .eq('parcel_category', 'LIQUIDATION')
    .is('batch_id', null)
    .in('current_stage', ['STAMPED', 'IN_STORAGE'])
    .order('tid')

  const { data: openBatches } = await supabase
    .from('batch')
    .select('batch_id, batch_number, batch_type')
    .eq('status', 'OPEN')
    .order('batch_number', { ascending: false })

  const now = serverNow()
  const eligible = (parcels ?? []).filter(
    (p) =>
      !p.hold_until || new Date(p.hold_until).getTime() <= now || p.hold_forced_success
  )

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Endorsement</h1>
          <p className="text-sm text-neutral-500">
            Pull matured, liquidation-track parcels into a batch.
          </p>
        </div>
        <Link
          href="/recovery/endorsement/no-awb"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-500"
        >
          NO-AWB entry
        </Link>
      </div>
      <EndorsementForm parcels={eligible} openBatches={openBatches ?? []} />
    </main>
  )
}
