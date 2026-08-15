import { withTransaction, queryRows, execute } from '@/lib/db/mysql'
import { isDuplicateKeyError } from '@/lib/ops/errors'

type Sack = {
  sack_id: number
  area: string
  status: string
  shipper_segment: string | null
}

// record_area_inbound_scan(tid, sack_code, area, station) — Tabs 2/5(a): the parcel
// must already exist (First Scan gate). Opens the sack on first sight, computes the
// STORAGE hold from ref_shipper_segment.hold_days on the sack's first parcel only.
export async function recordAreaInboundScan(
  email: string,
  tid: string,
  sackCode: string,
  area: 'STORAGE' | 'LIQUIDATION',
  station: string | null
) {
  if (area !== 'STORAGE' && area !== 'LIQUIDATION') {
    return { ok: false, error: 'invalid_area' }
  }

  return withTransaction(async (conn) => {
    const parcelRows = await queryRows<{ tid: string; sack_id: number | null; shipper_segment: string }>(
      conn,
      'select tid, sack_id, shipper_segment from parcel where tid = ? for update',
      [tid]
    )
    const parcel = parcelRows[0]
    if (!parcel) return { ok: false, error: 'not_first_scanned' }

    if (parcel.sack_id != null) {
      const existingSack = await queryRows<{ sack_code: string }>(
        conn,
        'select sack_code from sack where sack_id = ?',
        [parcel.sack_id]
      )
      return {
        ok: false,
        error: 'already_in_sack',
        sack_id: parcel.sack_id,
        sack_code: existingSack[0]?.sack_code ?? null,
      }
    }

    const sackRows = await queryRows<Sack>(
      conn,
      "select sack_id, area, status, shipper_segment from sack where sack_code = ? and status = 'OPEN' for update",
      [sackCode]
    )
    let sack = sackRows[0]

    if (!sack) {
      const insertResult = await execute(conn, 'insert into sack (sack_code, area, opened_by) values (?, ?, ?)', [
        sackCode,
        area,
        email,
      ])
      const sackId = insertResult.insertId
      await execute(conn, 'insert into sack_event (sack_id, action, scanned_by, station) values (?, ?, ?, ?)', [
        sackId,
        'OPENED',
        email,
        station,
      ])
      sack = { sack_id: sackId, area, status: 'OPEN', shipper_segment: null }
    } else if (sack.area !== area) {
      return { ok: false, error: 'area_mismatch', sack_area: sack.area }
    }

    if (sack.shipper_segment == null) {
      if (area === 'STORAGE') {
        const segRows = await queryRows<{ hold_days: number }>(
          conn,
          'select hold_days from ref_shipper_segment where code = ?',
          [parcel.shipper_segment]
        )
        const holdDays = segRows[0]?.hold_days ?? 0
        await execute(
          conn,
          `update sack
              set shipper_segment = ?,
                  hold_until = case when ? > 0 then date_add(current_timestamp(6), interval ? day) else null end,
                  updated_at = current_timestamp(6)
            where sack_id = ?`,
          [parcel.shipper_segment, holdDays, holdDays, sack.sack_id]
        )
      } else {
        await execute(
          conn,
          'update sack set shipper_segment = ?, updated_at = current_timestamp(6) where sack_id = ?',
          [parcel.shipper_segment, sack.sack_id]
        )
      }
    }

    const stage = area === 'STORAGE' ? 'IN_STORAGE' : 'IN_LIQUIDATION_AREA'

    await execute(
      conn,
      'update parcel set sack_id = ?, current_stage = ?, updated_at = current_timestamp(6) where tid = ?',
      [sack.sack_id, stage, tid]
    )
    await execute(conn, 'insert into stage_event (tid, stage, scanned_by, station) values (?, ?, ?, ?)', [
      tid,
      stage,
      email,
      station,
    ])

    return { ok: true, tid, sack_id: sack.sack_id, sack_code: sackCode, area }
  })
}

// close_sack(sack_code, station) — seals an OPEN sack to CLOSED.
export async function closeSack(email: string, sackCode: string, station: string | null) {
  return withTransaction(async (conn) => {
    const sackRows = await queryRows<{ sack_id: number; area: string }>(
      conn,
      "select sack_id, area from sack where sack_code = ? and status = 'OPEN' for update",
      [sackCode]
    )
    const sack = sackRows[0]
    if (!sack) return { ok: false, error: 'not_found' }

    try {
      await execute(conn, 'insert into sack_event (sack_id, action, scanned_by, station) values (?, ?, ?, ?)', [
        sack.sack_id,
        'CLOSED',
        email,
        station,
      ])
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      return { ok: false, error: 'already_closed' }
    }

    await execute(conn, "update sack set status = 'CLOSED', updated_at = current_timestamp(6) where sack_id = ?", [
      sack.sack_id,
    ])

    return { ok: true, sack_id: sack.sack_id, sack_code: sackCode, area: sack.area }
  })
}
