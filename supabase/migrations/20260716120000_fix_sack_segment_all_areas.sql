-- Fix found while reviewing M9/M10 screens: record_intake_scan only set
-- sack.shipper_segment for area='STORAGE' sacks, so every LIQUIDATION-area sack
-- (non-TTXB) displayed a blank Segment column on the assemble-pallet page. The
-- hold_until computation genuinely only applies to STORAGE, but the segment itself
-- is informational for any sack and should always be captured from its first parcel.
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

  -- First parcel into a freshly-opened sack sets its shipper_segment (informational
  -- for any area) and, for STORAGE sacks only, computes hold_until.
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
