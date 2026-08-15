import { withTransaction } from '@/lib/db/mysql'
import { isDuplicateKeyError } from '@/lib/ops/errors'

// blank_or_zero(text) — Excel/CSV blank-placeholder normalization: "", "-", "0",
// "0.0", "0.00" etc. all mean "no value", not the number zero.
export function blankOrZero(val: string | null | undefined): string | null {
  if (val == null) return null
  const trimmed = val.trim()
  if (trimmed === '' || trimmed === '-') return null
  if (/^0+(\.0+)?$/.test(trimmed)) return null
  return trimmed
}

function blankOrZeroNumber(val: string | null | undefined): number | null | typeof INVALID {
  const s = blankOrZero(val)
  if (s == null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : INVALID
}
const INVALID = Symbol('invalid_numeric_value')

// normalize_shipper_segment(text) — maps free-text CSV spellings to a
// ref_shipper_segment code, falling back to UNKNOWN.
export function normalizeShipperSegment(raw: string | null | undefined): string {
  const key = (raw ?? '').toUpperCase().replace(/[\s_-]+/g, '')
  switch (key) {
    case 'TTPH':
      return 'TTPH'
    case 'TTXB':
      return 'TTXB'
    case 'NONTTXB':
      return 'NON_TTXB'
    case 'B2B':
      return 'B2B'
    case 'PARTNERSHIPS':
      return 'PARTNERSHIPS'
    case 'CORP':
      return 'CORP'
    case 'CORPSALES':
      return 'CORP'
    default:
      return 'UNKNOWN'
  }
}

export type ImportRow = Record<string, string | null | undefined>
type SkipEntry = { row: ImportRow; reason: string }

// import_parcel_rows(rows) — bulk CSV upsert of staged parcel-import rows.
// Role-gated the same way the original in-body check was (not just at the route).
//
// The Postgres original used `insert ... on conflict (tid) do update ... where
// parcel_import.consumed_at is null` — MySQL's ON DUPLICATE KEY UPDATE has no WHERE
// clause, so a duplicate key falls back to an explicit conditional UPDATE instead,
// checked for affected-row-count the same way `get diagnostics` was used originally.
// Numeric parsing happens in JS before any write (not inside a DB exception handler
// per row), which is what lets a single bad row get skipped without needing a
// savepoint around the rest of the batch — nothing here can partially-fail a
// transaction the way a caught SQL cast error could.
export async function importParcelRows(
  email: string,
  role: string,
  rows: ImportRow[]
): Promise<{ ok: boolean; error?: string; imported?: number; skipped?: SkipEntry[] }> {
  if (!['warehouse_ops', 'recovery_team', 'owner'].includes(role)) {
    return { ok: false, error: 'forbidden' }
  }

  return withTransaction(async (conn) => {
    const skipped: SkipEntry[] = []
    let imported = 0
    let ttxbCount = 0
    let nonTtxbCount = 0

    for (const row of rows) {
      const tid = (row.tid ?? '').trim()
      if (!tid) {
        skipped.push({ row, reason: 'missing_tid' })
        continue
      }
      if (tid.length > 30) {
        skipped.push({ row, reason: 'tid_too_long' })
        continue
      }

      const codValue = blankOrZeroNumber(row.cod_value)
      const goodsValue = blankOrZeroNumber(row.goods_value)
      const insuranceValue = blankOrZeroNumber(row.insurance_value)
      const xbValueUsd = blankOrZeroNumber(row.xb_value_usd)
      if (
        codValue === INVALID ||
        goodsValue === INVALID ||
        insuranceValue === INVALID ||
        xbValueUsd === INVALID
      ) {
        skipped.push({ row, reason: 'invalid_numeric_value' })
        continue
      }

      const itemDescriptionRaw = (row.item_description ?? '').trim()
      const itemDescription =
        itemDescriptionRaw === '' || itemDescriptionRaw === '-' ? null : itemDescriptionRaw

      const values = [
        blankOrZero(row.granular_status),
        codValue,
        goodsValue,
        insuranceValue,
        xbValueUsd,
        blankOrZero(row.pets_ticket_type),
        blankOrZero(row.pets_ticket_subtype),
        blankOrZero(row.pets_ticket_outcome),
        blankOrZero(row.shipper_segment_raw),
        itemDescription,
        email,
      ]

      let affected: number
      try {
        await conn.query(
          `insert into parcel_import (
             tid, granular_status, cod_value, goods_value, insurance_value, xb_value_usd,
             pets_ticket_type, pets_ticket_subtype, pets_ticket_outcome, shipper_segment_raw,
             item_description, imported_by
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tid, ...values]
        )
        affected = 1
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err
        const [result] = await conn.query(
          `update parcel_import set
             granular_status = ?, cod_value = ?, goods_value = ?, insurance_value = ?,
             xb_value_usd = ?, pets_ticket_type = ?, pets_ticket_subtype = ?,
             pets_ticket_outcome = ?, shipper_segment_raw = ?, item_description = ?,
             imported_by = ?, imported_at = current_timestamp(6)
           where tid = ? and consumed_at is null`,
          [...values, tid]
        )
        affected = (result as { affectedRows: number }).affectedRows
      }

      if (affected === 0) {
        skipped.push({ row, reason: 'already_consumed' })
        continue
      }

      imported += 1
      if (normalizeShipperSegment(row.shipper_segment_raw) === 'TTXB') {
        ttxbCount += 1
      } else {
        nonTtxbCount += 1
      }
    }

    await conn.query(
      `insert into csv_upload_log
         (uploaded_by, total_rows, imported_count, skipped_count, ttxb_count, non_ttxb_count)
       values (?, ?, ?, ?, ?, ?)`,
      [email, rows.length, imported, skipped.length, ttxbCount, nonTtxbCount]
    )

    return { ok: true, imported, skipped }
  })
}
