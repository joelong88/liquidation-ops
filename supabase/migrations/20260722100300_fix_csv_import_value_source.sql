-- Bug found during live verification: record_first_scan's Tab-0 seeding path set
-- value_source/cod_source to lowercase 'csv_import', which violates
-- chk_parcel_value_source (only null, 'COD_SYNC', 'MANUAL_ESTIMATE' were allowed) and
-- made every CSV-seeded First Scan fail outright. A CSV-uploaded COD value is a real
-- courier-provided amount, not a guess, but it also isn't the (never-built) Redash
-- sync — 'CSV_IMPORT' is added as a third, honest provenance value rather than
-- mislabeling it as 'COD_SYNC'.
alter table parcel drop constraint chk_parcel_value_source;
alter table parcel add constraint chk_parcel_value_source
  check (value_source is null or value_source in ('COD_SYNC', 'MANUAL_ESTIMATE', 'CSV_IMPORT'));

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
        case when v_import.cod_value is not null then 'CSV_IMPORT' end,
        v_import.item_description,
        case when v_import.cod_value is not null then 'CSV_IMPORT' end
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
