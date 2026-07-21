-- M14 RPCs. record_first_scan/record_area_inbound_scan replace record_intake_scan
-- (deprecated in place, left callable, no longer wired to any UI) — the intake+
-- classification scan and the sack-association scan are now two separate stations
-- per Tab 1/2/5, reversing the earlier "combine into one scan" decision.

-- Tab 1: classifies + resolves the output bin the operator should carry the parcel to.
-- No sack association here.
create or replace function record_first_scan(
  p_tid text,
  p_parcel_category text default null,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parcel parcel%rowtype;
  v_existing_event stage_event%rowtype;
  v_bin_result jsonb;
begin
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
    return jsonb_build_object('ok', false, 'error', 'duplicate', 'event_ts', v_existing_event.event_ts);
  end;

  if p_parcel_category is not null and v_parcel.parcel_category is null then
    update parcel set parcel_category = p_parcel_category where tid = p_tid;
  end if;

  update parcel
    set current_stage = 'RECEIVED', received_at = coalesce(v_parcel.received_at, now()), updated_at = now()
    where tid = p_tid;

  v_bin_result := resolve_output_bin(p_tid);

  return jsonb_build_object('ok', true, 'tid', p_tid) || v_bin_result;
end;
$$;

comment on function record_first_scan is
  'Tab 1 (First Scan). Category required only for a brand-new TID. Sack association is
   NOT done here — see record_area_inbound_scan for Tabs 2/5(a).';


-- Tabs 2 & 5(a): sack association, once the parcel has physically reached its area.
-- Requires the TID to already exist from Tab 1 (record_first_scan) — a parcel skipping
-- First Scan is a real process violation, not something to silently paper over.
create or replace function record_area_inbound_scan(
  p_tid text,
  p_sack_code text,
  p_area text,
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
begin
  if p_area not in ('STORAGE', 'LIQUIDATION') then
    return jsonb_build_object('ok', false, 'error', 'invalid_area');
  end if;

  select * into v_parcel from parcel where tid = p_tid for update;
  if v_parcel.tid is null then
    return jsonb_build_object('ok', false, 'error', 'not_first_scanned');
  end if;
  if v_parcel.sack_id is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_sack', 'sack_id', v_parcel.sack_id);
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

  if v_sack.shipper_segment is null then
    if p_area = 'STORAGE' then
      select hold_days into v_hold_days from ref_shipper_segment where code = v_parcel.shipper_segment;
      update sack
        set shipper_segment = v_parcel.shipper_segment,
            hold_until = case when coalesce(v_hold_days, 0) > 0
                           then now() + make_interval(days => v_hold_days)
                           else null end,
            updated_at = now()
        where sack_id = v_sack.sack_id;
    else
      update sack
        set shipper_segment = v_parcel.shipper_segment, updated_at = now()
        where sack_id = v_sack.sack_id;
    end if;
  end if;

  update parcel
    set sack_id = v_sack.sack_id,
        current_stage = case when p_area = 'STORAGE' then 'IN_STORAGE' else 'IN_LIQUIDATION_AREA' end,
        updated_at = now()
    where tid = p_tid;

  return jsonb_build_object('ok', true, 'tid', p_tid, 'sack_id', v_sack.sack_id, 'area', p_area);
end;
$$;

comment on function record_area_inbound_scan is
  'Tabs 2 (area=STORAGE) & 5(a) (area=LIQUIDATION). Requires record_first_scan already
   ran for this TID. TTXB sacks reaching the Liquidation area via pallet-consolidation
   (assign_pallet) do NOT go through this function — they arrive sack-only, per Tab 5(b).';


-- F-J -> bin lookup, most-specific-match-wins, fallback bin F. A rule pointing at A/B
-- (TTXB Storage) or C/D (Liquidation area) gets its final letter picked by computed
-- is_hvi — Joel/the manual-entry form only needs to say "route to Storage" or "route to
-- Liquidation area", not enter separate HVI/Non-HVI rows for the same criteria.
create or replace function resolve_output_bin(p_tid text) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parcel parcel%rowtype;
  v_rule output_mapping_rule%rowtype;
  v_threshold numeric;
  v_effective_value numeric;
  v_is_hvi boolean;
  v_bin text;
  v_bin_row ref_output_bin%rowtype;
begin
  select * into v_parcel from parcel where tid = p_tid for update;
  if v_parcel.tid is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select r.* into v_rule from output_mapping_rule r
    join output_mapping_upload u on u.upload_id = r.upload_id and u.is_active
    where (r.status is null or r.status = v_parcel.granular_status)
      and (r.shipper is null or r.shipper = v_parcel.shipper_segment)
      and (r.ticket_type is null or r.ticket_type = v_parcel.pets_ticket_type)
      and (r.ticket_subtype is null or r.ticket_subtype = v_parcel.pets_ticket_subtype)
      and (r.order_outcome is null or r.order_outcome = v_parcel.pets_ticket_outcome)
    order by
      (r.status is not null)::int + (r.shipper is not null)::int + (r.ticket_type is not null)::int
      + (r.ticket_subtype is not null)::int + (r.order_outcome is not null)::int desc,
      r.rule_id
    limit 1;

  v_effective_value := coalesce(v_parcel.cod_value, v_parcel.manual_value);
  select value_numeric into v_threshold from ref_config where key = 'hvi_threshold_php';
  v_is_hvi := case when v_effective_value is null then null
                    else v_effective_value >= coalesce(v_threshold, 2000) end;

  v_bin := coalesce(v_rule.output_bin, 'F');
  if v_bin in ('A', 'B') then
    v_bin := case when coalesce(v_is_hvi, false) then 'A' else 'B' end;
  elsif v_bin in ('C', 'D') then
    v_bin := case when coalesce(v_is_hvi, false) then 'C' else 'D' end;
  end if;

  select * into v_bin_row from ref_output_bin where code = v_bin;

  update parcel
    set resolved_output_bin = v_bin,
        is_hvi = v_is_hvi,
        needs_force_success = coalesce(v_rule.needs_force_success, false) or v_parcel.needs_force_success,
        output_resolved_at = now(),
        updated_at = now()
    where tid = p_tid;

  return jsonb_build_object(
    'ok', true, 'tid', p_tid, 'bin', v_bin, 'bin_label', v_bin_row.label, 'area', v_bin_row.area,
    'is_hvi', v_is_hvi, 'matched_rule', v_rule.rule_id,
    'needs_force_success', coalesce(v_rule.needs_force_success, false)
  );
end;
$$;

comment on function resolve_output_bin is
  'No mapping rules exist until Joel enters some (add_output_mapping_rule) — every call
   resolves to bin F until then. Expected, not a bug; the UI should say so plainly.';


-- Minimal manual-entry replacement for a full daily-upload pipeline, sized to what
-- Joel can actually use right now. Owner-only (see RLS migration).
create or replace function add_output_mapping_rule(
  p_status text default null,
  p_shipper text default null,
  p_ticket_type text default null,
  p_ticket_subtype text default null,
  p_order_outcome text default null,
  p_output_bin text default null,
  p_needs_force_success boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_upload_id bigint;
  v_rule_id bigint;
begin
  if p_output_bin is null or not exists (select 1 from ref_output_bin where code = p_output_bin) then
    return jsonb_build_object('ok', false, 'error', 'invalid_output_bin');
  end if;

  select upload_id into v_upload_id from output_mapping_upload where is_active limit 1;

  begin
    insert into output_mapping_rule
      (upload_id, status, shipper, ticket_type, ticket_subtype, order_outcome, output_bin, needs_force_success)
      values
      (v_upload_id, p_status, p_shipper, p_ticket_type, p_ticket_subtype, p_order_outcome, p_output_bin, p_needs_force_success)
      returning rule_id into v_rule_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate_rule');
  end;

  return jsonb_build_object('ok', true, 'rule_id', v_rule_id);
end;
$$;

grant execute on function record_first_scan(text, text, text) to authenticated;
grant execute on function record_area_inbound_scan(text, text, text, text) to authenticated;
grant execute on function resolve_output_bin(text) to authenticated;
grant execute on function add_output_mapping_rule(text, text, text, text, text, text, boolean) to authenticated;
