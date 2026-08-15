import { withTransaction, queryRows, execute } from '@/lib/db/mysql'
import { isDuplicateKeyError } from '@/lib/ops/errors'

type SkipEntry = { sack_code?: string; tid?: string; reason: string }

// assign_pallet(pallet_code, sack_codes[], tids[]) — consolidates stripped sacks
// and/or NO-AWB TIDs onto a pallet, creating it on first reference. Skip-with-reason
// per item, not all-or-nothing.
//
// Creating a brand-new pallet was recovery_team/owner-only under the original RLS
// (`pallet_insert_recovery`); adding to an existing one was open to warehouse_ops
// too (`pallet_update_ops_recovery`). The route-level check alone can't express
// that split since it's one function doing both operations conditionally, so it's
// enforced here once we know which branch we're actually in.
export async function assignPallet(
  email: string,
  role: string,
  palletCode: string,
  sackCodes: string[],
  tids: string[]
) {
  return withTransaction(async (conn) => {
    const palletRows = await queryRows<{ pallet_id: number; status: string }>(
      conn,
      'select pallet_id, status from pallet where pallet_code = ? for update',
      [palletCode]
    )
    let pallet = palletRows[0]

    if (!pallet) {
      if (!['recovery_team', 'owner'].includes(role)) {
        return { ok: false, error: 'forbidden' }
      }
      const insertResult = await execute(conn, 'insert into pallet (pallet_code, assembled_by) values (?, ?)', [
        palletCode,
        email,
      ])
      pallet = { pallet_id: insertResult.insertId, status: 'ASSEMBLING' }
    } else if (pallet.status !== 'ASSEMBLING') {
      return { ok: false, error: 'pallet_not_assembling', status: pallet.status }
    }

    const addedSacks: string[] = []
    const addedTids: string[] = []
    const skipped: SkipEntry[] = []

    for (const sackCode of sackCodes) {
      const sackRows = await queryRows<{ sack_id: number; status: string; pallet_id: number | null }>(
        conn,
        'select sack_id, status, pallet_id from sack where sack_code = ? for update',
        [sackCode]
      )
      const sack = sackRows[0]
      if (!sack) {
        skipped.push({ sack_code: sackCode, reason: 'not_found' })
        continue
      }
      if (sack.status !== 'STRIPPED') {
        skipped.push({ sack_code: sackCode, reason: 'not_stripped' })
        continue
      }
      if (sack.pallet_id != null) {
        skipped.push({ sack_code: sackCode, reason: 'already_on_pallet' })
        continue
      }

      await execute(
        conn,
        "update sack set pallet_id = ?, status = 'ON_PALLET', updated_at = current_timestamp(6) where sack_id = ?",
        [pallet.pallet_id, sack.sack_id]
      )
      await execute(
        conn,
        "update parcel set pallet_id = ?, current_stage = 'ON_PALLET', updated_at = current_timestamp(6) where sack_id = ?",
        [pallet.pallet_id, sack.sack_id]
      )
      await execute(conn, 'insert into pallet_event (pallet_id, action, scanned_by, metadata) values (?, ?, ?, ?)', [
        pallet.pallet_id,
        'SACK_ADDED',
        email,
        JSON.stringify({ sack_code: sackCode }),
      ])
      addedSacks.push(sackCode)
    }

    // NO-AWB parcels have no sack (no physical bag to scan) — assigned directly.
    for (const tid of tids) {
      const parcelRows = await queryRows<{ tid: string; is_synthetic_tid: number | boolean; pallet_id: number | null }>(
        conn,
        'select tid, is_synthetic_tid, pallet_id from parcel where tid = ? for update',
        [tid]
      )
      const parcel = parcelRows[0]
      if (!parcel) {
        skipped.push({ tid, reason: 'not_found' })
        continue
      }
      if (!parcel.is_synthetic_tid) {
        skipped.push({ tid, reason: 'not_no_awb' })
        continue
      }
      if (parcel.pallet_id != null) {
        skipped.push({ tid, reason: 'already_on_pallet' })
        continue
      }

      await execute(
        conn,
        "update parcel set pallet_id = ?, current_stage = 'ON_PALLET', updated_at = current_timestamp(6) where tid = ?",
        [pallet.pallet_id, tid]
      )
      await execute(conn, 'insert into pallet_event (pallet_id, action, scanned_by, metadata) values (?, ?, ?, ?)', [
        pallet.pallet_id,
        'TID_ADDED',
        email,
        JSON.stringify({ tid }),
      ])
      addedTids.push(tid)
    }

    return { ok: true, pallet_id: pallet.pallet_id, added_sacks: addedSacks, added_tids: addedTids, skipped }
  })
}

// close_pallet(pallet_code, station) — seals an ASSEMBLING pallet to CLOSED.
export async function closePallet(email: string, palletCode: string, station: string | null) {
  return withTransaction(async (conn) => {
    const palletRows = await queryRows<{ pallet_id: number }>(
      conn,
      "select pallet_id from pallet where pallet_code = ? and status = 'ASSEMBLING' for update",
      [palletCode]
    )
    const pallet = palletRows[0]
    if (!pallet) return { ok: false, error: 'not_found' }

    try {
      await execute(conn, 'insert into pallet_event (pallet_id, action, scanned_by, station) values (?, ?, ?, ?)', [
        pallet.pallet_id,
        'CLOSED',
        email,
        station,
      ])
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      return { ok: false, error: 'already_closed' }
    }

    await execute(conn, "update pallet set status = 'CLOSED', updated_at = current_timestamp(6) where pallet_id = ?", [
      pallet.pallet_id,
    ])

    return { ok: true, pallet_id: pallet.pallet_id, pallet_code: palletCode }
  })
}

// endorse_pallets_to_admin(pallet_ids[]) — bulk weekly digital hand-off, no scan.
export async function endorsePalletsToAdmin(email: string, palletIds: number[]) {
  return withTransaction(async (conn) => {
    const endorsed: number[] = []
    const skipped: SkipEntry[] = []

    for (const palletId of palletIds) {
      const palletRows = await queryRows<{ pallet_id: number; status: string }>(
        conn,
        'select pallet_id, status from pallet where pallet_id = ? for update',
        [palletId]
      )
      const pallet = palletRows[0]
      if (!pallet) {
        skipped.push({ reason: 'not_found' })
        continue
      }
      if (!['ASSEMBLING', 'CLOSED'].includes(pallet.status)) {
        skipped.push({ reason: 'not_assembling' })
        continue
      }

      try {
        await execute(conn, 'insert into pallet_event (pallet_id, action, scanned_by) values (?, ?, ?)', [
          pallet.pallet_id,
          'ENDORSED',
          email,
        ])
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err
        skipped.push({ reason: 'already_endorsed' })
        continue
      }

      await execute(
        conn,
        "update pallet set status = 'ENDORSED', endorsed_at = current_timestamp(6), endorsed_by = ?, updated_at = current_timestamp(6) where pallet_id = ?",
        [email, pallet.pallet_id]
      )
      await execute(
        conn,
        "update parcel set current_stage = 'ENDORSED', updated_at = current_timestamp(6) where pallet_id = ?",
        [pallet.pallet_id]
      )
      endorsed.push(palletId)
    }

    return { ok: true, endorsed, skipped }
  })
}

// record_pallet_outbound(pallet_code, station) — physical exit scan, requires SOLD.
export async function recordPalletOutbound(email: string, palletCode: string, station: string | null) {
  return withTransaction(async (conn) => {
    const palletRows = await queryRows<{ pallet_id: number; status: string }>(
      conn,
      'select pallet_id, status from pallet where pallet_code = ? for update',
      [palletCode]
    )
    const pallet = palletRows[0]
    if (!pallet) return { ok: false, error: 'not_found' }
    if (pallet.status !== 'SOLD') return { ok: false, error: 'not_sold', status: pallet.status }

    try {
      await execute(conn, 'insert into pallet_event (pallet_id, action, scanned_by, station) values (?, ?, ?, ?)', [
        pallet.pallet_id,
        'OUTGOING',
        email,
        station,
      ])
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err
      return { ok: false, error: 'already_outgoing' }
    }

    await execute(
      conn,
      "update pallet set status = 'OUTGOING', outgoing_at = current_timestamp(6), outgoing_by = ?, updated_at = current_timestamp(6) where pallet_id = ?",
      [email, pallet.pallet_id]
    )
    await execute(
      conn,
      "update parcel set current_stage = 'OUTGOING', updated_at = current_timestamp(6) where pallet_id = ?",
      [pallet.pallet_id]
    )

    return { ok: true, pallet_id: pallet.pallet_id }
  })
}
