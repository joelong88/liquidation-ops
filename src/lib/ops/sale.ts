import type { PoolConnection } from 'mysql2/promise'
import { withTransaction, queryRows, execute } from '@/lib/db/mysql'
import { isDuplicateKeyError } from '@/lib/ops/errors'

// recompute_batch_pricing(batch_id) — ceiling = sum(cod_value) across the batch's
// parcels, floor = ceiling/2. Faithfully ported as-is: still cod_value, not
// effective_value — an earlier planning note flagged switching to effective_value
// as a future improvement, but the deployed function never actually made that
// change, so this port matches what's live today, not what a design doc proposed.
async function recomputeBatchPricing(conn: PoolConnection, batchId: number) {
  const rows = await queryRows<{ total: number }>(
    conn,
    'select coalesce(sum(cod_value), 0) as total from parcel where batch_id = ?',
    [batchId]
  )
  const total = Number(rows[0]?.total ?? 0)
  await execute(
    conn,
    'update batch set ceiling_price = ?, floor_price = ?, updated_at = current_timestamp(6) where batch_id = ?',
    [total, Math.round((total / 2) * 100) / 100, batchId]
  )
}

async function recordBatchSaleInternal(
  conn: PoolConnection,
  email: string,
  batchId: number,
  buyerName: string,
  saleAmount: number,
  saleDate: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (saleAmount == null || saleAmount <= 0) return { ok: false, error: 'invalid_amount' }
  if (!buyerName || buyerName.trim().length === 0) return { ok: false, error: 'buyer_name_required' }

  try {
    await execute(
      conn,
      `insert into sale (batch_id, channel, buyer_name, sale_amount, sale_date, created_by)
       values (?, 'EXTERNAL_AUCTION', ?, ?, coalesce(?, curdate()), ?)`,
      [batchId, buyerName, saleAmount, saleDate, email]
    )
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err
    return { ok: false, error: 'already_sold' }
  }

  await execute(conn, "update batch set status = 'SOLD', updated_at = current_timestamp(6) where batch_id = ?", [
    batchId,
  ])
  return { ok: true }
}

// record_batch_sale(batch_id, buyer_name, sale_amount, sale_date) — records a
// winning external-auction bid against an existing batch.
export async function recordBatchSale(
  email: string,
  batchId: number,
  buyerName: string,
  saleAmount: number,
  saleDate: string | null
) {
  return withTransaction((conn) => recordBatchSaleInternal(conn, email, batchId, buyerName, saleAmount, saleDate))
}

type SkipEntry = { pallet_id: number; reason: string }

// record_pallet_sale(pallet_ids[], buyer_name, sale_amount, batch_id?, sale_date?) —
// bundles multiple ENDORSED pallets into one batch/sale (creating the batch if
// p_batch_id wasn't given), recomputes pricing, then records the sale. All within
// one transaction so a mid-way failure can't leave pallets half-batched.
export async function recordPalletSale(
  email: string,
  palletIds: number[],
  buyerName: string,
  saleAmount: number,
  batchId: number | null,
  saleDate: string | null
) {
  return withTransaction(async (conn) => {
    let resolvedBatchId: number
    if (batchId == null) {
      const maxRows = await queryRows<{ next: number }>(
        conn,
        'select coalesce(max(batch_number), 0) + 1 as next from batch'
      )
      const nextBatchNumber = maxRows[0].next
      const insertResult = await execute(
        conn,
        `insert into batch (batch_number, batch_type, status, month, created_by)
         values (?, 'STANDARD', 'OPEN', date_format(current_timestamp(6), '%Y-%m-01'), ?)`,
        [nextBatchNumber, email]
      )
      resolvedBatchId = insertResult.insertId
    } else {
      resolvedBatchId = batchId
    }

    const sold: number[] = []
    const skipped: SkipEntry[] = []

    for (const palletId of palletIds) {
      const palletRows = await queryRows<{ pallet_id: number; status: string; batch_id: number | null }>(
        conn,
        'select pallet_id, status, batch_id from pallet where pallet_id = ? for update',
        [palletId]
      )
      const pallet = palletRows[0]
      if (!pallet) {
        skipped.push({ pallet_id: palletId, reason: 'not_found' })
        continue
      }
      if (pallet.status !== 'ENDORSED') {
        skipped.push({ pallet_id: palletId, reason: 'not_endorsed' })
        continue
      }
      if (pallet.batch_id != null) {
        skipped.push({ pallet_id: palletId, reason: 'already_batched' })
        continue
      }

      await execute(conn, 'update pallet set batch_id = ?, updated_at = current_timestamp(6) where pallet_id = ?', [
        resolvedBatchId,
        palletId,
      ])
      await execute(conn, 'update parcel set batch_id = ?, updated_at = current_timestamp(6) where pallet_id = ?', [
        resolvedBatchId,
        palletId,
      ])
      sold.push(palletId)
    }

    if (sold.length === 0) {
      return { ok: false, error: 'no_eligible_pallets', skipped }
    }

    await recomputeBatchPricing(conn, resolvedBatchId)
    const saleResult = await recordBatchSaleInternal(conn, email, resolvedBatchId, buyerName, saleAmount, saleDate)
    if (!saleResult.ok) {
      return { ok: false, error: saleResult.error, batch_id: resolvedBatchId }
    }

    await execute(conn, `update pallet set status = 'SOLD', updated_at = current_timestamp(6) where pallet_id in (?)`, [
      sold,
    ])
    await execute(
      conn,
      `update parcel set current_stage = 'SOLD', updated_at = current_timestamp(6) where pallet_id in (?)`,
      [sold]
    )

    return { ok: true, batch_id: resolvedBatchId, sold_pallets: sold, skipped }
  })
}
