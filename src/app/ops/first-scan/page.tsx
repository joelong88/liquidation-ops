import { createClient } from '@/lib/supabase/server'
import { FirstScanForm } from '@/app/ops/first-scan/first-scan-form'

export default async function FirstScanPage() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('ref_parcel_category')
    .select('code, label')
    .order('code')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">First Scan</h2>
        <p className="text-sm text-neutral-500">
          The first scan a parcel gets entering the liquidation warehouse. Classifies it and
          tells you which physical bin (A–G) to carry it to. No sack yet — that happens at the
          Storage or Liquidation area inbound station.
        </p>
      </div>
      <FirstScanForm categories={categories ?? []} />
    </div>
  )
}
