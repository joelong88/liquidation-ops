import { createClient } from '@/lib/supabase/server'
import { FirstScanForm } from '@/app/ops/first-scan/first-scan-form'

export default async function FirstScanPage() {
  const supabase = await createClient()
  const [{ data: bins }, { data: config }] = await Promise.all([
    supabase.from('ref_output_bin').select('code, label, area, is_hvi').order('code'),
    supabase.from('ref_config').select('value_numeric').eq('key', 'hvi_threshold_php').maybeSingle(),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">First Scan</h2>
      </div>
      <FirstScanForm bins={bins ?? []} hviThreshold={Number(config?.value_numeric ?? 3000)} />
    </div>
  )
}
