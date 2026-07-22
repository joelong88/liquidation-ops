import { createClient } from '@/lib/supabase/server'
import { FirstScanForm } from '@/app/ops/first-scan/first-scan-form'

export default async function FirstScanPage() {
  const supabase = await createClient()
  const { data: bins } = await supabase
    .from('ref_output_bin')
    .select('code, label, area, is_hvi')
    .order('code')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">First Scan</h2>
        <p className="text-sm text-neutral-500">
          Scan the TID — the system looks up its status and tells you which bin to carry it to.
          No sack yet — that happens at the Storage or Liquidation area inbound station.
        </p>
      </div>
      <FirstScanForm bins={bins ?? []} />
    </div>
  )
}
