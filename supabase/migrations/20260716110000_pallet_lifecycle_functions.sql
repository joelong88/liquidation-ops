-- M10: pallet assembly, weekly digital endorsement, outbound scan, and sale
-- recording. Same conventions as Phase 1's endorsement_functions.sql: SECURITY
-- INVOKER, skip-with-reason per item rather than aborting a whole bulk call.

-- Consolidates stripped sacks (and/or direct NO-AWB TIDs, which have no sack) onto a
-- pallet. Creates the pallet on first reference if it doesn't exist yet.
create or replace function assign_pallet(
  p_pallet_code text,
  p_sack_codes text[] default null,
  p_tids text[] default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pallet pallet%rowtype;
  v_sack sack%rowtype;
  v_parcel parcel%rowtype;
  v_code text;
  v_tid text;
  v_added_sacks text[] := '{}';
  v_added_tids text[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
begin
  select * into v_pallet from pallet where pallet_code = p_pallet_code for update;

  if v_pallet.pallet_id is null then
    insert into pallet (pallet_code, assembled_by)
      values (p_pallet_code, auth.uid())
      returning * into v_pallet;
  elsif v_pallet.status <> 'ASSEMBLING' then
    return jsonb_build_object('ok', false, 'error', 'pallet_not_assembling', 'status', v_pallet.status);
  end if;

  foreach v_code in array coalesce(p_sack_codes, '{}') loop
    select * into v_sack from sack where sack_code = v_code for update;

    if v_sack.sack_id is null then
      v_skipped := v_skipped || jsonb_build_object('sack_code', v_code, 'reason', 'not_found');
      continue;
    end if;
    if v_sack.status <> 'STRIPPED' then
      v_skipped := v_skipped || jsonb_build_object('sack_code', v_code, 'reason', 'not_stripped');
      continue;
    end if;
    if v_sack.pallet_id is not null then
      v_skipped := v_skipped || jsonb_build_object('sack_code', v_code, 'reason', 'already_on_pallet');
      continue;
    end if;

    update sack set pallet_id = v_pallet.pallet_id, status = 'ON_PALLET', updated_at = now()
      where sack_id = v_sack.sack_id;

    update parcel set pallet_id = v_pallet.pallet_id, current_stage = 'ON_PALLET', updated_at = now()
      where sack_id = v_sack.sack_id;

    insert into pallet_event (pallet_id, action, scanned_by, metadata)
      values (v_pallet.pallet_id, 'SACK_ADDED', auth.uid(), jsonb_build_object('sack_code', v_code));

    v_added_sacks := v_added_sacks || v_code;
  end loop;

  -- NO-AWB parcels have no sack (no physical bag to scan) — assigned directly.
  foreach v_tid in array coalesce(p_tids, '{}') loop
    select * into v_parcel from parcel where tid = v_tid for update;

    if v_parcel.tid is null then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'not_found');
      continue;
    end if;
    if not v_parcel.is_synthetic_tid then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'not_no_awb');
      continue;
    end if;
    if v_parcel.pallet_id is not null then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'already_on_pallet');
      continue;
    end if;

    update parcel set pallet_id = v_pallet.pallet_id, current_stage = 'ON_PALLET', updated_at = now()
      where tid = v_tid;

    insert into pallet_event (pallet_id, action, scanned_by, metadata)
      values (v_pallet.pallet_id, 'TID_ADDED', auth.uid(), jsonb_build_object('tid', v_tid));

    v_added_tids := v_added_tids || v_tid;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'pallet_id', v_pallet.pallet_id,
    'added_sacks', to_jsonb(v_added_sacks),
    'added_tids', to_jsonb(v_added_tids),
    'skipped', v_skipped
  );
end;
$$;

grant execute on function assign_pallet(text, text[], text[]) to authenticated;


-- Weekly, bulk, digital hand-off to the admin team. Not a scan — the pallet was
-- already scanned into the liquidation area earlier (record_intake_scan/strip_sack).
create or replace function endorse_pallets_to_admin(
  p_pallet_ids bigint[]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pallet_id bigint;
  v_pallet pallet%rowtype;
  v_endorsed bigint[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
begin
  foreach v_pallet_id in array p_pallet_ids loop
    select * into v_pallet from pallet where pallet_id = v_pallet_id for update;

    if v_pallet.pallet_id is null then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_found');
      continue;
    end if;
    if v_pallet.status <> 'ASSEMBLING' then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_assembling');
      continue;
    end if;

    begin
      insert into pallet_event (pallet_id, action, scanned_by)
        values (v_pallet.pallet_id, 'ENDORSED', auth.uid());
    exception when unique_violation then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'already_endorsed');
      continue;
    end;

    update pallet
      set status = 'ENDORSED', endorsed_at = now(), endorsed_by = auth.uid(), updated_at = now()
      where pallet_id = v_pallet.pallet_id;

    update parcel set current_stage = 'ENDORSED', updated_at = now()
      where pallet_id = v_pallet.pallet_id;

    v_endorsed := v_endorsed || v_pallet_id;
  end loop;

  return jsonb_build_object('ok', true, 'endorsed', to_jsonb(v_endorsed), 'skipped', v_skipped);
end;
$$;

grant execute on function endorse_pallets_to_admin(bigint[]) to authenticated;


-- Pallet-level exit scan, after a bid is won ("Outgoing" — Liquidation Prototype.xlsx:
-- "physical scan of pallet ID to indicate exit from liquidation area", both TTXB and
-- non-TTXB). Requires SOLD — a pallet can't physically leave before its bid is won.
create or replace function record_pallet_outbound(
  p_pallet_code text,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pallet pallet%rowtype;
begin
  select * into v_pallet from pallet where pallet_code = p_pallet_code for update;

  if v_pallet.pallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_pallet.status <> 'SOLD' then
    return jsonb_build_object('ok', false, 'error', 'not_sold', 'status', v_pallet.status);
  end if;

  begin
    insert into pallet_event (pallet_id, action, scanned_by, station)
      values (v_pallet.pallet_id, 'OUTGOING', auth.uid(), p_station);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_outgoing');
  end;

  update pallet
    set status = 'OUTGOING', outgoing_at = now(), outgoing_by = auth.uid(), updated_at = now()
    where pallet_id = v_pallet.pallet_id;

  update parcel set current_stage = 'OUTGOING', updated_at = now()
    where pallet_id = v_pallet.pallet_id;

  return jsonb_build_object('ok', true, 'pallet_id', v_pallet.pallet_id);
end;
$$;

grant execute on function record_pallet_outbound(text, text) to authenticated;


-- Extends (doesn't replace) record_batch_sale: a batch can bundle multiple pallets
-- into one sale/recovery-% (confirmed with Joel — batch and pallet stay distinct).
-- Still uses cod_value for pricing here, unchanged from Phase 1's
-- recompute_batch_pricing — that function switches to effective_value in M11 once
-- manual-value capture exists; not introduced early to avoid a dependency on a
-- column this migration doesn't create.
create or replace function record_pallet_sale(
  p_pallet_ids bigint[],
  p_buyer_name text,
  p_sale_amount numeric,
  p_batch_id bigint default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id bigint;
  v_next_batch_number int;
  v_pallet_id bigint;
  v_pallet pallet%rowtype;
  v_sold bigint[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_sale_result jsonb;
begin
  if p_batch_id is null then
    select coalesce(max(batch_number), 0) + 1 into v_next_batch_number from batch;
    insert into batch (batch_number, batch_type, status, month, created_by)
      values (v_next_batch_number, 'STANDARD', 'OPEN', date_trunc('month', now())::date, auth.uid())
      returning batch_id into v_batch_id;
  else
    v_batch_id := p_batch_id;
  end if;

  foreach v_pallet_id in array p_pallet_ids loop
    select * into v_pallet from pallet where pallet_id = v_pallet_id for update;

    if v_pallet.pallet_id is null then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_found');
      continue;
    end if;
    if v_pallet.status <> 'ENDORSED' then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_endorsed');
      continue;
    end if;
    if v_pallet.batch_id is not null then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'already_batched');
      continue;
    end if;

    update pallet set batch_id = v_batch_id, updated_at = now() where pallet_id = v_pallet_id;
    update parcel set batch_id = v_batch_id, updated_at = now() where pallet_id = v_pallet_id;

    v_sold := v_sold || v_pallet_id;
  end loop;

  if array_length(v_sold, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'no_eligible_pallets', 'skipped', v_skipped);
  end if;

  perform recompute_batch_pricing(v_batch_id);
  v_sale_result := record_batch_sale(v_batch_id, p_buyer_name, p_sale_amount);

  if not (v_sale_result->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', v_sale_result->>'error', 'batch_id', v_batch_id);
  end if;

  update pallet set status = 'SOLD', updated_at = now() where pallet_id = any(v_sold);
  update parcel set current_stage = 'SOLD', updated_at = now() where pallet_id = any(v_sold);

  return jsonb_build_object(
    'ok', true, 'batch_id', v_batch_id, 'sold_pallets', to_jsonb(v_sold), 'skipped', v_skipped
  );
end;
$$;

grant execute on function record_pallet_sale(bigint[], text, numeric, bigint) to authenticated;
