import { createClient } from '@/lib/supabase/server'
import { EndorsePalletsForm } from '@/app/ops/endorsement/endorse-pallets-form'

export default async function EndorsementPage() {
  const supabase = await createClient()
  const { data: pallets } = await supabase
    .from('pallet')
    .select('pallet_id, pallet_code')
    .in('status', ['ASSEMBLING', 'CLOSED'])
    .order('assembled_at')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Endorsement</h2>
        <p className="text-sm text-neutral-500">
          Weekly bulk digital hand-off of assembled pallets to the admin team. Not a scan.
        </p>
      </div>
      <EndorsePalletsForm
        pallets={(pallets ?? []).map((p) => ({ pallet_id: p.pallet_id, pallet_code: p.pallet_code }))}
      />
    </div>
  )
}
