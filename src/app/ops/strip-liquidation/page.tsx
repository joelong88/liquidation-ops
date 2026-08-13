import { StripAndConsolidateForm } from '@/app/ops/strip-and-consolidate-form'
import { CardHeader } from '@/components/overview-ui'

export default function StripLiquidationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <CardHeader title="Strip & Consolidate — Liquidation Area" />
        <p className="mt-2 text-sm text-neutral-500">
          Sack-level scan, no hold gate (non-TTXB — no storage/hold applies here). Scan a
          pallet ID once, then scan each closed sack — it gets stripped and added straight onto
          that pallet in one confirmation. Close the pallet once it&apos;s full to start a new one.
        </p>
      </div>
      <StripAndConsolidateForm area="LIQUIDATION" />
    </div>
  )
}
