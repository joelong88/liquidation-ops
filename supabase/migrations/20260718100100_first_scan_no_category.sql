-- The operator no longer picks a category at First Scan — the bin recommendation
-- comes entirely from resolve_output_bin's data-driven lookup (Status/Ticket/Outcome
-- criteria), not a manual classification step. parcel_category was never NOT NULL at
-- the schema level (only this function enforced it as a business rule) — dropping
-- the requirement here is enough, no column change needed.
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
