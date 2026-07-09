-- Atomic scan-recording RPC for the /scan flow (M4). A single scan can touch up to
-- three things (create/update parcel, insert stage_event, compute hold_until) — wrapping
-- them in one plpgsql function makes that atomic instead of several sequential round
-- trips from the client that could partially fail. SECURITY INVOKER (not DEFINER): this
-- runs as the calling authenticated user, so the existing RLS policies on parcel/
-- stage_event still gate who can actually do this — the function adds atomicity, not
-- elevated privilege.
create or replace function record_scan_event(
  p_tid text,
  p_stage text,
  p_parcel_category text default null,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parcel parcel%rowtype;
  v_new_seq int;
  v_cur_seq int;
  v_hold_days int;
  v_existing_event stage_event%rowtype;
begin
  select seq_order into v_new_seq from ref_stage where code = p_stage;
  if v_new_seq is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_stage');
  end if;

  select * into v_parcel from parcel where tid = p_tid for update;

  if v_parcel.tid is null then
    if p_stage <> 'RECEIVED' then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if p_parcel_category is null then
      return jsonb_build_object('ok', false, 'error', 'category_required');
    end if;

    insert into parcel (tid, parcel_category, current_stage, received_at)
    values (p_tid, p_parcel_category, 'RECEIVED', now())
    returning * into v_parcel;
  end if;

  begin
    insert into stage_event (tid, stage, scanned_by, station)
    values (p_tid, p_stage, auth.uid(), p_station);
  exception when unique_violation then
    select * into v_existing_event from stage_event
      where tid = p_tid and stage = p_stage
      order by event_ts desc
      limit 1;
    return jsonb_build_object(
      'ok', false,
      'error', 'duplicate',
      'event_ts', v_existing_event.event_ts
    );
  end;

  select seq_order into v_cur_seq from ref_stage where code = v_parcel.current_stage;

  if v_new_seq > coalesce(v_cur_seq, 0) then
    update parcel set current_stage = p_stage, updated_at = now() where tid = p_tid;
  end if;

  if p_stage = 'IN_STORAGE' then
    select hold_days into v_hold_days from ref_shipper_segment where code = v_parcel.shipper_segment;
    if coalesce(v_hold_days, 0) > 0 then
      update parcel
        set hold_until = now() + make_interval(days => v_hold_days)
        where tid = p_tid and hold_until is null;
    end if;
  end if;

  if p_parcel_category is not null and v_parcel.parcel_category is null then
    update parcel set parcel_category = p_parcel_category where tid = p_tid;
  end if;

  return jsonb_build_object('ok', true, 'tid', p_tid, 'stage', p_stage);
end;
$$;

comment on function record_scan_event is
  'Category is required only when the scan creates a brand-new parcel row (i.e. a '
  'RECEIVED scan for a TID with no existing PETS-synced row). Existing parcels can be '
  'scanned through later stages without resupplying it.';

grant execute on function record_scan_event(text, text, text, text) to authenticated;
