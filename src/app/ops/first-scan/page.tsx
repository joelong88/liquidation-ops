import { query } from '@/lib/db/mysql'
import { FirstScanForm } from '@/app/ops/first-scan/first-scan-form'
import { CardHeader } from '@/components/overview-ui'

export default async function FirstScanPage() {
  const [bins, configRows] = await Promise.all([
    query<{ code: string; label: string; area: string | null; is_hvi: number }>(
      'select code, label, area, is_hvi from ref_output_bin order by code'
    ),
    query<{ value_numeric: number | null }>(
      "select value_numeric from ref_config where `key` = 'hvi_threshold_php'"
    ),
  ])

  return (
    <div className="flex flex-col gap-4">
      <CardHeader title="First Scan" />
      <FirstScanForm
        bins={bins.map((b) => ({ ...b, is_hvi: Boolean(b.is_hvi) }))}
        hviThreshold={Number(configRows[0]?.value_numeric ?? 3000)}
      />
    </div>
  )
}
