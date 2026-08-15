import { withTransaction, queryRows, execute } from '@/lib/db/mysql'

// repack_scan(tid, station) — exception-only: pulls one TID out of an open/closed
// Storage sack mid-hold, independent of the rest of the sack.
export async function repackScan(email: string, tid: string, station: string | null) {
  return withTransaction(async (conn) => {
    const parcelRows = await queryRows<{ tid: string; sack_id: number | null }>(
      conn,
      'select tid, sack_id from parcel where tid = ? for update',
      [tid]
    )
    const parcel = parcelRows[0]
    if (!parcel) return { ok: false, error: 'not_found' }
    if (parcel.sack_id == null) return { ok: false, error: 'not_in_open_sack' }

    const sackRows = await queryRows<{ sack_id: number; area: string; status: string }>(
      conn,
      'select sack_id, area, status from sack where sack_id = ? for update',
      [parcel.sack_id]
    )
    const sack = sackRows[0]
    if (!sack || sack.area !== 'STORAGE' || !['OPEN', 'CLOSED'].includes(sack.status)) {
      return { ok: false, error: 'sack_not_open_storage' }
    }

    await execute(conn, 'insert into stage_event (tid, stage, scanned_by, station) values (?, ?, ?, ?)', [
      tid,
      'REPACKED',
      email,
      station,
    ])
    await execute(
      conn,
      'insert into sack_event (sack_id, action, scanned_by, station, metadata) values (?, ?, ?, ?, ?)',
      [sack.sack_id, 'REPACK_OPENED', email, station, JSON.stringify({ tid })]
    )
    await execute(
      conn,
      'update parcel set current_stage = ?, sack_id = null, updated_at = current_timestamp(6) where tid = ?',
      ['REPACKED', tid]
    )

    return { ok: true, tid, sack_id: sack.sack_id }
  })
}

// force_sack_hold_success(sack_code, reason) — sack-grain audited override of the
// 7-day TTXB hold; reason is required and logged.
export async function forceSackHoldSuccess(email: string, sackCode: string, reason: string) {
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: 'reason_required' }
  }

  return withTransaction(async (conn) => {
    const sackRows = await queryRows<{ sack_id: number }>(
      conn,
      "select sack_id from sack where sack_code = ? and status = 'CLOSED' and area = 'STORAGE' for update",
      [sackCode]
    )
    const sack = sackRows[0]
    if (!sack) return { ok: false, error: 'not_found' }

    await execute(
      conn,
      `update sack
          set hold_forced_success = true, hold_forced_by = ?, hold_forced_reason = ?,
              hold_forced_at = current_timestamp(6), updated_at = current_timestamp(6)
        where sack_id = ?`,
      [email, reason, sack.sack_id]
    )
    await execute(conn, 'insert into sack_event (sack_id, action, scanned_by, metadata) values (?, ?, ?, ?)', [
      sack.sack_id,
      'HOLD_FORCED',
      email,
      JSON.stringify({ reason }),
    ])

    return { ok: true, sack_id: sack.sack_id }
  })
}

// strip_sack(sack_code, area, station) — sack-level, hold-gated for STORAGE sacks;
// bulk-advances member parcels still sitting at an earlier stage to STRIPPED.
export async function stripSack(
  email: string,
  sackCode: string,
  area: 'STORAGE' | 'LIQUIDATION',
  station: string | null
) {
  return withTransaction(async (conn) => {
    const sackRows = await queryRows<{
      sack_id: number
      status: string
      hold_until: string | null
      hold_forced_success: number | boolean
    }>(
      conn,
      `select sack_id, status, hold_until, hold_forced_success from sack
         where sack_code = ? and area = ? and status in ('OPEN', 'CLOSED', 'STRIPPED')
         order by created_at desc
         limit 1
         for update`,
      [sackCode, area]
    )
    const sack = sackRows[0]
    if (!sack) return { ok: false, error: 'not_found' }
    if (sack.status === 'OPEN') return { ok: false, error: 'not_closed' }
    if (sack.status === 'STRIPPED') return { ok: false, error: 'already_stripped' }

    if (
      area === 'STORAGE' &&
      sack.hold_until != null &&
      new Date(sack.hold_until).getTime() > Date.now() &&
      !sack.hold_forced_success
    ) {
      return { ok: false, error: 'hold_not_matured', hold_until: sack.hold_until }
    }

    await execute(conn, 'insert into sack_event (sack_id, action, scanned_by, station) values (?, ?, ?, ?)', [
      sack.sack_id,
      'STRIPPED',
      email,
      station,
    ])
    await execute(
      conn,
      "update sack set status = 'STRIPPED', stripped_at = current_timestamp(6), stripped_by = ?, updated_at = current_timestamp(6) where sack_id = ?",
      [email, sack.sack_id]
    )
    const advanceResult = await execute(
      conn,
      `update parcel set current_stage = 'STRIPPED', updated_at = current_timestamp(6)
         where sack_id = ? and current_stage in ('RECEIVED', 'IN_STORAGE', 'IN_LIQUIDATION_AREA')`,
      [sack.sack_id]
    )

    return { ok: true, sack_id: sack.sack_id, parcels_advanced: advanceResult.affectedRows }
  })
}
