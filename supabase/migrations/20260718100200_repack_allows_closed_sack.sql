-- Found while reviewing the close-sack change: repack_scan only allowed pulling a
-- TID from an OPEN sack. A sack can now be CLOSED (sealed for stripping) while still
-- mid-hold, and a TikTok repack request could arrive during that window. Widen the
-- gate to accept either.
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
  if v_sack.area <> 'STORAGE' or v_sack.status not in ('OPEN', 'CLOSED') then
    return jsonb_build_object('ok', false, 'error', 'sack_not_open_storage');
  end if;

  insert into stage_event (tid, stage, scanned_by, station)
    values (p_tid, 'REPACKED', auth.uid(), p_station);

  insert into sack_event (sack_id, action, scanned_by, station, metadata)
    values (v_sack.sack_id, 'REPACK_OPENED', auth.uid(), p_station, jsonb_build_object('tid', p_tid));

  update parcel
    set current_stage = 'REPACKED',
        sack_id = null,
        updated_at = now()
    where tid = p_tid;

  return jsonb_build_object('ok', true, 'tid', p_tid, 'sack_id', v_sack.sack_id);
end;
$$;
