'use client'

import { useState } from 'react'
import { AreaInboundForm } from '@/app/ops/area-inbound-form'
import { ConsolidatePalletForm } from '@/app/ops/inbound-liquidation/consolidate-pallet-form'
import { NoAwbForm } from '@/app/ops/inbound-liquidation/no-awb-form'

type Sack = { sack_id: number; sack_code: string; shipper_segment: string | null }
type NoAwbParcel = { tid: string; cod_value: number | null }

export function InboundLiquidationModeTabs({
  sacks,
  noAwbParcels,
}: {
  sacks: Sack[]
  noAwbParcels: NoAwbParcel[]
}) {
  const [mode, setMode] = useState<'new-arrival' | 'consolidate'>('new-arrival')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('new-arrival')}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            mode === 'new-arrival'
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-300 text-neutral-700'
          }`}
        >
          New arrival (non-TTXB, first scan into this area)
        </button>
        <button
          type="button"
          onClick={() => setMode('consolidate')}
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            mode === 'consolidate'
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-300 text-neutral-700'
          }`}
        >
          Consolidate onto pallet (TTXB sacks from Storage + NO-AWB)
        </button>
      </div>

      {mode === 'new-arrival' ? (
        <AreaInboundForm area="LIQUIDATION" />
      ) : (
        <div className="flex flex-col gap-6">
          <NoAwbForm />
          <ConsolidatePalletForm sacks={sacks} noAwbParcels={noAwbParcels} />
        </div>
      )}
    </div>
  )
}
