-- record_first_scan now seeds a brand-new parcel from any staged Tab-0 import row for
-- that TID (granular_status/cod_value/item_description) before calling resolve_output_bin
-- — without this, resolve_output_bin's F-J match criteria are always null and every scan
-- falls through to the bin F fallback, which is the whole gap Tab 0 exists to close.
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
  v_import parcel_import%rowtype;
begin
  select * into v_parcel from parcel where tid = p_tid for update;

  if v_parcel.tid is null then
    select * into v_import from parcel_import where tid = p_tid and consumed_at is null;

    insert into parcel (
      tid, parcel_category, current_stage, received_at,
      granular_status, cod_value, cod_source, manual_value_item_description, value_source
    )
      values (
        p_tid, p_parcel_category, 'RECEIVED', now(),
        v_import.granular_status,
        v_import.cod_value,
        case when v_import.cod_value is not null then 'csv_import' end,
        v_import.item_description,
        case when v_import.cod_value is not null then 'csv_import' end
      )
      returning * into v_parcel;

    if v_import.tid is not null then
      update parcel_import set consumed_at = now() where tid = p_tid;
    end if;
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
