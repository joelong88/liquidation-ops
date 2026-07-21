import { StripLiquidationForm } from '@/app/ops/strip-liquidation/strip-form'

export default function StripLiquidationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">
          Stripping from Liquidation Area
        </h2>
        <p className="text-sm text-neutral-500">
          Sack-level scan, no hold gate (non-TTXB — no storage/hold applies here).
        </p>
      </div>
      <StripLiquidationForm />
    </div>
  )
}
