-- M5: endorsement (pull matured parcels into a batch), NO-AWB manual entry, batch
-- pricing, and winning-bid recording. All SECURITY INVOKER — RLS on parcel/batch/
-- stage_event/sale still gates who can actually do this; these functions add
-- atomicity across multiple related writes, not elevated privilege.

create or replace function recompute_batch_pricing(p_batch_id bigint) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(cod_value), 0) into v_total from parcel where batch_id = p_batch_id;
  update batch
    set ceiling_price = v_total,
        floor_price = round(v_total / 2, 2),
        updated_at = now()
    where batch_id = p_batch_id;
end;
$$;

-- Eligibility for endorsement: LIQUIDATION category, past STAMPED, not already in a
-- batch, and — for TTXB parcels with a hold_until — either matured or force-overridden.
-- TIDs failing eligibility are skipped with a reason rather than aborting the whole
-- call, so one bad TID in a multi-select doesn't block the rest.
create or replace function endorse_parcels_to_batch(
  p_tids text[],
  p_batch_id bigint default null,
  p_batch_type text default 'STANDARD',
  p_pallet_code text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id bigint;
  v_tid text;
  v_parcel parcel%rowtype;
  v_endorsed text[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_next_batch_number int;
begin
  if p_batch_id is null then
    select coalesce(max(batch_number), 0) + 1 into v_next_batch_number from batch;
    insert into batch (batch_number, batch_type, status, month, created_by)
      values (v_next_batch_number, p_batch_type, 'OPEN', date_trunc('month', now())::date, auth.uid())
      returning batch_id into v_batch_id;
  else
    v_batch_id := p_batch_id;
  end if;

  foreach v_tid in array p_tids loop
    select * into v_parcel from parcel where tid = v_tid for update;

    if v_parcel.tid is null then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'not_found');
      continue;
    end if;
    if v_parcel.batch_id is not null then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'already_batched');
      continue;
    end if;
    if v_parcel.parcel_category <> 'LIQUIDATION' then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'not_liquidation_category');
      continue;
    end if;
    if v_parcel.current_stage not in ('STAMPED', 'IN_STORAGE') then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'wrong_stage');
      continue;
    end if;
    if v_parcel.hold_until is not null
       and v_parcel.hold_until > now()
       and not v_parcel.hold_forced_success then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'hold_not_matured');
      continue;
    end if;

    begin
      insert into stage_event (tid, stage, scanned_by, station)
        values (v_tid, 'ENDORSED', auth.uid(), 'Endorsement');
    exception when unique_violation then
      v_skipped := v_skipped || jsonb_build_object('tid', v_tid, 'reason', 'already_endorsed');
      continue;
    end;

    update parcel
      set batch_id = v_batch_id,
          current_stage = 'ENDORSED',
          pallet_code = coalesce(p_pallet_code, pallet_code),
          updated_at = now()
      where tid = v_tid;

    v_endorsed := v_endorsed || v_tid;
  end loop;

  perform recompute_batch_pricing(v_batch_id);

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'endorsed', to_jsonb(v_endorsed),
    'skipped', v_skipped
  );
end;
$$;

-- NO-AWB parcels have no tracking ID to scan — this is the manual-entry path for
-- them, generating a synthetic TID (NOAWB-000123) so every downstream FK still works
-- uniformly. Volume in the legacy sheets was real (17,798 rows), not an edge case.
create or replace function create_no_awb_parcel(
  p_cod numeric,
  p_batch_id bigint default null,
  p_batch_type text default 'NO_AWB',
  p_pallet_code text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id bigint;
  v_tid text;
  v_next_batch_number int;
begin
  if p_cod is null or p_cod <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_cod');
  end if;

  if p_batch_id is null then
    select coalesce(max(batch_number), 0) + 1 into v_next_batch_number from batch;
    insert into batch (batch_number, batch_type, status, month, created_by)
      values (v_next_batch_number, p_batch_type, 'OPEN', date_trunc('month', now())::date, auth.uid())
      returning batch_id into v_batch_id;
  else
    v_batch_id := p_batch_id;
  end if;

  v_tid := 'NOAWB-' || lpad(nextval('noawb_seq')::text, 6, '0');

  insert into parcel (
    tid, is_synthetic_tid, parcel_category, cod_value, cod_source,
    current_stage, pallet_code, batch_id, received_at
  ) values (
    v_tid, true, 'LIQUIDATION', p_cod, 'manual_no_awb',
    'ENDORSED', p_pallet_code, v_batch_id, now()
  );

  insert into stage_event (tid, stage, scanned_by, station)
    values (v_tid, 'ENDORSED', auth.uid(), 'NO-AWB manual entry');

  perform recompute_batch_pricing(v_batch_id);

  return jsonb_build_object('ok', true, 'tid', v_tid, 'batch_id', v_batch_id);
end;
$$;

-- Records the winning external-auction bid as a pending sale (payment_date/status
-- follow later, from finance in M6). One sale per batch is enforced by
-- uq_sale_one_per_batch — a second attempt is reported back as 'already_sold'
-- rather than a raw constraint error.
create or replace function record_batch_sale(
  p_batch_id bigint,
  p_buyer_name text,
  p_sale_amount numeric
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_sale_amount is null or p_sale_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if p_buyer_name is null or length(trim(p_buyer_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'buyer_name_required');
  end if;

  begin
    insert into sale (batch_id, channel, buyer_name, sale_amount, created_by)
      values (p_batch_id, 'EXTERNAL_AUCTION', p_buyer_name, p_sale_amount, auth.uid());
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_sold');
  end;

  update batch set status = 'SOLD', updated_at = now() where batch_id = p_batch_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function recompute_batch_pricing(bigint) to authenticated;
grant execute on function endorse_parcels_to_batch(text[], bigint, text, text) to authenticated;
grant execute on function create_no_awb_parcel(numeric, bigint, text, text) to authenticated;
grant execute on function record_batch_sale(bigint, text, numeric) to authenticated;
