import { createClient } from '@/lib/supabase/server'
import { ConsolidatePalletForm } from '@/app/ops/consolidate-pallet/consolidate-pallet-form'

export default async function ConsolidatePalletPage() {
  const supabase = await createClient()
  const { data: sacks } = await supabase
    .from('sack')
    .select('sack_id, sack_code, shipper_segment')
    .eq('status', 'STRIPPED')
    .eq('area', 'STORAGE')
    .order('sack_code')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Consolidate onto Pallet</h2>
        <p className="text-sm text-neutral-500">
          TTXB sacks arriving already-stripped from Storage get consolidated onto a pallet
          (~10 sacks/pallet).
        </p>
      </div>
      <ConsolidatePalletForm sacks={sacks ?? []} />
    </div>
  )
}
