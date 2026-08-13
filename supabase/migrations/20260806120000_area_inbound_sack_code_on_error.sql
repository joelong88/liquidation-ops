-- already_in_sack only returned the sack's internal numeric id, not its human-scanned
-- code — useless for an operator reading the error on screen. Look up and return the
-- code too.
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
  v_stage text;
  v_existing_sack_code text;
begin
  if p_area not in ('STORAGE', 'LIQUIDATION') then
    return jsonb_build_object('ok', false, 'error', 'invalid_area');
  end if;

  select * into v_parcel from parcel where tid = p_tid for update;
  if v_parcel.tid is null then
    return jsonb_build_object('ok', false, 'error', 'not_first_scanned');
  end if;
  if v_parcel.sack_id is not null then
    select sack_code into v_existing_sack_code from sack where sack_id = v_parcel.sack_id;
    return jsonb_build_object('ok', false, 'error', 'already_in_sack', 'sack_id', v_parcel.sack_id, 'sack_code', v_existing_sack_code);
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

  v_stage := case when p_area = 'STORAGE' then 'IN_STORAGE' else 'IN_LIQUIDATION_AREA' end;

  update parcel
    set sack_id = v_sack.sack_id,
        current_stage = v_stage,
        updated_at = now()
    where tid = p_tid;

  insert into stage_event (tid, stage, scanned_by, station)
    values (p_tid, v_stage, auth.uid(), p_station);

  return jsonb_build_object('ok', true, 'tid', p_tid, 'sack_id', v_sack.sack_id, 'sack_code', p_sack_code, 'area', p_area);
end;
$$;
