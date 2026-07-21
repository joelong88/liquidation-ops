-- Phase 2 intake/storage RPCs. Same conventions as Phase 1's scan_functions.sql:
-- SECURITY INVOKER (RLS on parcel/sack/stage_event/sack_event still gates who can
-- actually do this — these functions add atomicity, not elevated privilege), duplicate
-- scans return a friendly jsonb error rather than a raw constraint violation.
--
-- record_scan_event (Phase 1) is left untouched and still callable — the old /scan
-- route keeps working until the frontend is cut over route-by-route (see Phase 2
-- migration sequencing in the plan).

-- Combined intake+classification scan (Liquidation Prototype.xlsx: "physical scans of
-- the various TIDs and the physical sack ID, to associate them tgt" — this is what the
-- existing files call STAMP). p_area is operator-selected from the physical station,
-- not derived from shipper_segment: segment sync may lag behind the physical scan,
-- same pre-existing assumption record_scan_event already made for IN_STORAGE.
create or replace function record_intake_scan(
  p_tid text,
  p_sack_code text,
  p_area text,
  p_parcel_category text default null,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parcel parcel%rowtype;
  v_sack sack%rowtype;
  v_hold_days int;
  v_existing_event stage_event%rowtype;
begin
  if p_area not in ('STORAGE', 'LIQUIDATION') then
    return jsonb_build_object('ok', false, 'error', 'invalid_area');
  end if;

  select * into v_sack from sack where sack_code = p_sack_code and status = 'OPEN' for update;

  if v_sack.sack_id is null then
    insert into sack (sack_code, area, opened_by)
      values (p_sack_code, p_area, auth.uid())
      returning * into v_sack;
    insert into sack_event (sack_id, action, scanned_by, station)
      values (v_sack.sack_id, 'OPENED', auth.uid(), p_station);
  elsif v_sack.area <> p_area then
    return jsonb_build_object('ok', false, 'error', 'area_mismatch', 'sack_area', v_sack.area);
  end if;

  select * into v_parcel from parcel where tid = p_tid for update;

  if v_parcel.tid is null then
    if p_parcel_category is null then
      return jsonb_build_object('ok', false, 'error', 'category_required');
    end if;
    insert into parcel (tid, parcel_category, current_stage, received_at)
      values (p_tid, p_parcel_category, 'RECEIVED', now())
      returning * into v_parcel;
  end if;

  begin
    insert into stage_event (tid, stage, scanned_by, station)
      values (p_tid, 'RECEIVED', auth.uid(), p_station);
  exception when unique_violation then
    select * into v_existing_event from stage_event
      where tid = p_tid and stage = 'RECEIVED'
      order by event_ts desc
      limit 1;
    return jsonb_build_object(
      'ok', false, 'error', 'duplicate', 'event_ts', v_existing_event.event_ts
    );
  end;

  -- First parcel into a freshly-opened STORAGE sack sets its hold_until, from that
  -- parcel's shipper segment — mirrors how record_scan_event computes hold_until on
  -- IN_STORAGE today, just moved to sack grain and to intake time instead of a
  -- separate later scan.
  if p_area = 'STORAGE' and v_sack.shipper_segment is null then
    select hold_days into v_hold_days from ref_shipper_segment where code = v_parcel.shipper_segment;
    update sack
      set shipper_segment = v_parcel.shipper_segment,
          hold_until = case when coalesce(v_hold_days, 0) > 0
                         then now() + make_interval(days => v_hold_days)
                         else null end,
          updated_at = now()
      where sack_id = v_sack.sack_id;
  end if;

  if p_parcel_category is not null and v_parcel.parcel_category is null then
    update parcel set parcel_category = p_parcel_category where tid = p_tid;
  end if;

  update parcel
    set sack_id = v_sack.sack_id,
        current_stage = case when p_area = 'STORAGE' then 'IN_STORAGE' else 'RECEIVED' end,
        received_at = coalesce(v_parcel.received_at, now()),
        updated_at = now()
    where tid = p_tid;

  return jsonb_build_object('ok', true, 'tid', p_tid, 'sack_id', v_sack.sack_id, 'area', p_area);
end;
$$;

comment on function record_intake_scan is
  'Category is required only when the scan creates a brand-new parcel row, same rule '
  'as Phase 1''s record_scan_event. Replaces record_scan_event for the intake step '
  'only — later stages (strip/pallet/endorse/sale/outbound) are bulk RPCs below and '
  'in the M10 migration, not per-TID scans.';

grant execute on function record_intake_scan(text, text, text, text, text) to authenticated;


-- Exception-only, TikTok-request-triggered: pulls ONE TID out of a still-open STORAGE
-- sack for relabel/redelivery. The rest of the sack keeps waiting out its hold
-- normally. Ungated/repeatable (no unique constraint on the stage_event) — unlike the
-- other stage transitions, a parcel being pulled for repack isn't a one-time gate we
-- need to protect against double-firing.
create or replace function repack_scan(
  p_tid text,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parcel parcel%rowtype;
  v_sack sack%rowtype;
begin
  select * into v_parcel from parcel where tid = p_tid for update;
  if v_parcel.tid is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_parcel.sack_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_in_open_sack');
  end if;

  select * into v_sack from sack where sack_id = v_parcel.sack_id for update;
  if v_sack.area <> 'STORAGE' or v_sack.status <> 'OPEN' then
    return jsonb_build_object('ok', false, 'error', 'sack_not_open_storage');
  end if;

  insert into stage_event (tid, stage, scanned_by, station)
    values (p_tid, 'REPACKED', auth.uid(), p_station);

  insert into sack_event (sack_id, action, scanned_by, station, metadata)
    values (v_sack.sack_id, 'REPACK_OPENED', auth.uid(), p_station, jsonb_build_object('tid', p_tid));

  -- Pulled out of the sack entirely — its value/count should no longer roll up into
  -- that sack once the rest of it is eventually stripped.
  update parcel
    set current_stage = 'REPACKED',
        sack_id = null,
        updated_at = now()
    where tid = p_tid;

  return jsonb_build_object('ok', true, 'tid', p_tid, 'sack_id', v_sack.sack_id);
end;
$$;

grant execute on function repack_scan(text, text) to authenticated;


-- Sack-grain hold override (Phase 1 had this per-parcel; moved to sack grain since
-- stripping is now a bulk sack-level scan — see comment on sack.hold_forced_success).
-- The per-TID exception case is repack_scan above, a different mechanism.
create or replace function force_sack_hold_success(
  p_sack_code text,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sack sack%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select * into v_sack from sack
    where sack_code = p_sack_code and status = 'OPEN' and area = 'STORAGE'
    for update;

  if v_sack.sack_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update sack
    set hold_forced_success = true,
        hold_forced_by = auth.uid()::text,
        hold_forced_reason = p_reason,
        hold_forced_at = now(),
        updated_at = now()
    where sack_id = v_sack.sack_id;

  insert into sack_event (sack_id, action, scanned_by, metadata)
    values (v_sack.sack_id, 'HOLD_FORCED', auth.uid(), jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'sack_id', v_sack.sack_id);
end;
$$;

grant execute on function force_sack_hold_success(text, text) to authenticated;


-- Bulk sack-level scan before stripping (Liquidation Prototype.xlsx: "physical scan of
-- sack ID prior to stripping" for both TTXB storage-outbound and non-TTXB stripping —
-- no per-TID scan at this step). Hold-gated for STORAGE sacks only; LIQUIDATION-area
-- sacks (non-TTXB, no hold) strip freely.
create or replace function strip_sack(
  p_sack_code text,
  p_area text,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sack sack%rowtype;
  v_advanced int;
begin
  select * into v_sack from sack
    where sack_code = p_sack_code and area = p_area and status = 'OPEN'
    for update;

  if v_sack.sack_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_area = 'STORAGE'
     and v_sack.hold_until is not null
     and v_sack.hold_until > now()
     and not v_sack.hold_forced_success then
    return jsonb_build_object('ok', false, 'error', 'hold_not_matured', 'hold_until', v_sack.hold_until);
  end if;

  begin
    insert into sack_event (sack_id, action, scanned_by, station)
      values (v_sack.sack_id, 'STRIPPED', auth.uid(), p_station);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_stripped');
  end;

  update sack
    set status = 'STRIPPED', stripped_at = now(), stripped_by = auth.uid(), updated_at = now()
    where sack_id = v_sack.sack_id;

  update parcel
    set current_stage = 'STRIPPED', updated_at = now()
    where sack_id = v_sack.sack_id and current_stage in ('RECEIVED', 'IN_STORAGE');
  get diagnostics v_advanced = row_count;

  return jsonb_build_object('ok', true, 'sack_id', v_sack.sack_id, 'parcels_advanced', v_advanced);
end;
$$;

grant execute on function strip_sack(text, text, text) to authenticated;
