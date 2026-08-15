import type { PoolConnection } from 'mysql2/promise'
import { withTransaction, queryRows, execute } from '@/lib/db/mysql'
import { isDuplicateKeyError } from '@/lib/ops/errors'
import { normalizeShipperSegment } from '@/lib/ops/import'

type Parcel = {
  tid: string
  resolved_output_bin: string | null
  needs_force_success: number | boolean
  is_hvi: number | boolean | null
}

type ParcelImportRow = {
  tid: string
  granular_status: string | null
  cod_value: number | null
  goods_value: number | null
  insurance_value: number | null
  xb_value_usd: number | null
  pets_ticket_type: string | null
  pets_ticket_subtype: string | null
  pets_ticket_outcome: string | null
  shipper_segment_raw: string | null
  item_description: string | null
}

// resolve_output_bin(tid) — matches the parcel against output_mapping_rule
// (most-specific-match-wins: most non-null gate columns first, then rule_id as a
// tiebreak), computes HVI from effective_value vs. the configured threshold, and
// resolves A/B or C/D by HVI-ness. Falls back to bin F when nothing matches. Always
// called inside an existing transaction (the caller already holds the parcel row).
export async function resolveOutputBin(conn: PoolConnection, tid: string) {
  const parcelRows = await queryRows<{
    tid: string
    resolved_output_bin: string | null
    needs_force_success: number | boolean
    granular_status: string | null
    shipper_segment: string
    pets_ticket_type: string | null
    pets_ticket_subtype: string | null
    pets_ticket_outcome: string | null
    effective_value: number | null
  }>(
    conn,
    'select tid, resolved_output_bin, needs_force_success, granular_status, shipper_segment, pets_ticket_type, pets_ticket_subtype, pets_ticket_outcome, effective_value from parcel where tid = ? for update',
    [tid]
  )
  const parcel = parcelRows[0]
  if (!parcel) return { ok: false, error: 'not_found' }

  const ruleRows = await queryRows<{ rule_id: number; output_bin: string; needs_force_success: number | boolean }>(
    conn,
    `select r.rule_id, r.output_bin, r.needs_force_success
       from output_mapping_rule r
       join output_mapping_upload u on u.upload_id = r.upload_id and u.is_active = true
      where (r.status is null or upper(r.status) = upper(?))
        and (r.shipper is null or upper(r.shipper) = upper(?))
        and (r.ticket_type is null or upper(r.ticket_type) = upper(?))
        and (r.ticket_subtype is null or upper(r.ticket_subtype) = upper(?))
        and (r.order_outcome is null or upper(r.order_outcome) = upper(?))
      order by
        (r.status is not null) + (r.shipper is not null) + (r.ticket_type is not null)
          + (r.ticket_subtype is not null) + (r.order_outcome is not null) desc,
        r.rule_id
      limit 1`,
    [parcel.granular_status, parcel.shipper_segment, parcel.pets_ticket_type, parcel.pets_ticket_subtype, parcel.pets_ticket_outcome]
  )
  const rule = ruleRows[0] as (typeof ruleRows)[0] | undefined

  const configRows = await queryRows<{ value_numeric: number }>(
    conn,
    "select value_numeric from ref_config where `key` = 'hvi_threshold_php'"
  )
  const threshold = configRows[0]?.value_numeric ?? 3000
  const effectiveValue = parcel.effective_value
  const isHvi = effectiveValue == null ? null : effectiveValue >= threshold

  let bin = rule?.output_bin ?? 'F'
  if (bin === 'A' || bin === 'B') bin = isHvi ? 'A' : 'B'
  else if (bin === 'C' || bin === 'D') bin = isHvi ? 'C' : 'D'

  const binRows = await queryRows<{ label: string; area: string | null }>(
    conn,
    'select label, area from ref_output_bin where code = ?',
    [bin]
  )
  const binRow = binRows[0]

  const needsForceSuccess = Boolean(rule?.needs_force_success) || Boolean(parcel.needs_force_success)

  await execute(
    conn,
    `update parcel
        set resolved_output_bin = ?, is_hvi = ?, needs_force_success = ?,
            output_resolved_at = current_timestamp(6), updated_at = current_timestamp(6)
      where tid = ?`,
    [bin, isHvi, needsForceSuccess, tid]
  )

  return {
    ok: true,
    tid,
    bin,
    bin_label: binRow?.label ?? null,
    area: binRow?.area ?? null,
    is_hvi: isHvi,
    matched_rule: rule?.rule_id ?? null,
    needs_force_success: needsForceSuccess,
  }
}

// record_first_scan(tid, parcel_category, station) — Tab 1: creates/finds the
// parcel (seeding value/PETS-ticket fields from a staged parcel_import row on first
// sight), records the RECEIVED stage_event (duplicate-safe), and resolves the output
// bin. A duplicate scan returns the ALREADY-stored bin, never a fresh recompute —
// resolve_output_bin only ever runs once, at creation.
export async function recordFirstScan(
  email: string,
  tid: string,
  parcelCategory: string | null,
  station: string | null
) {
  if (tid.length > 30) return { ok: false, error: 'tid_too_long' }

  return withTransaction(async (conn) => {
    const existingRows = await queryRows<Parcel>(
      conn,
      'select tid, resolved_output_bin, needs_force_success, is_hvi from parcel where tid = ? for update',
      [tid]
    )
    let parcel = existingRows[0]

    if (!parcel) {
      const importRows = await queryRows<ParcelImportRow>(
        conn,
        'select * from parcel_import where tid = ? and consumed_at is null',
        [tid]
      )
      const imp = importRows[0]

      await execute(
        conn,
        `insert into parcel (
           tid, parcel_category, current_stage, received_at,
           granular_status, cod_value, goods_value, insurance_value, xb_value_usd,
           pets_ticket_type, pets_ticket_subtype, pets_ticket_outcome,
           shipper_segment, cod_source, manual_value_item_description, value_source
         ) values (?, ?, 'RECEIVED', current_timestamp(6), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tid,
          parcelCategory,
          imp?.granular_status ?? null,
          imp?.cod_value ?? null,
          imp?.goods_value ?? null,
          imp?.insurance_value ?? null,
          imp?.xb_value_usd ?? null,
          imp?.pets_ticket_type ?? null,
          imp?.pets_ticket_subtype ?? null,
          imp?.pets_ticket_outcome ?? null,
          imp ? normalizeShipperSegment(imp.shipper_segment_raw) : 'UNKNOWN',
          imp?.cod_value != null ? 'CSV_IMPORT' : null,
          imp?.item_description ?? null,
          imp ? 'CSV_IMPORT' : null,
        ]
      )
      if (imp) {
        await execute(conn, 'update parcel_import set consumed_at = current_timestamp(6) where tid = ?', [tid])
      }
      const freshRows = await queryRows<Parcel>(
        conn,
        'select tid, resolved_output_bin, needs_force_success, is_hvi from parcel where tid = ?',
        [tid]
      )
      parcel = freshRows[0]
    }

    try {
      await execute(conn, 'insert into stage_event (tid, stage, scanned_by, station) values (?, ?, ?, ?)', [
        tid,
        'RECEIVED',
        email,
        station,
      ])
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      const eventRows = await queryRows<{ event_ts: string }>(
        conn,
        `select event_ts from stage_event where tid = ? and stage = 'RECEIVED' order by event_ts desc limit 1`,
        [tid]
      )
      const binRows = await queryRows<{ label: string; area: string | null }>(
        conn,
        'select label, area from ref_output_bin where code = ?',
        [parcel!.resolved_output_bin]
      )
      return {
        ok: true,
        tid,
        duplicate: true,
        event_ts: eventRows[0]?.event_ts ?? null,
        bin: parcel!.resolved_output_bin,
        bin_label: binRows[0]?.label ?? null,
        area: binRows[0]?.area ?? null,
        is_hvi: parcel!.is_hvi,
      }
    }

    if (parcelCategory != null) {
      await execute(conn, 'update parcel set parcel_category = coalesce(parcel_category, ?) where tid = ?', [
        parcelCategory,
        tid,
      ])
    }
    await execute(
      conn,
      `update parcel
          set current_stage = 'RECEIVED',
              received_at = coalesce(received_at, current_timestamp(6)),
              updated_at = current_timestamp(6)
        where tid = ?`,
      [tid]
    )

    const binResult = await resolveOutputBin(conn, tid)
    return { tid, ...binResult }
  })
}
