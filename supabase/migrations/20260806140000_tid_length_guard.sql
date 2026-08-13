-- Real incident: a parcel row was created with tid = ~48 concatenated TIDs
-- space-separated together (~900 chars), almost certainly a paste/scan artifact.
-- Add a hard, can't-be-bypassed ceiling at the DB level (covers every insertion
-- path — record_first_scan, create_no_awb_parcel, anything future), plus a clean
-- skip-with-reason check at CSV import time and a record_first_scan-level check so
-- operators get a clear message instead of a raw constraint-violation error. Real
-- TIDs observed in production are 13-19 characters; 30 leaves generous headroom.
-- NOT VALID: enforce for every new insert/update from here on, without retroactively
-- validating (and failing on) the one known-bad row Joel asked to leave alone.
alter table parcel add constraint chk_tid_length check (length(tid) <= 30) not valid;
alter table parcel_import add constraint chk_parcel_import_tid_length check (length(tid) <= 30);

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
  v_bin_row ref_output_bin%rowtype;
begin
  if length(p_tid) > 30 then
    return jsonb_build_object('ok', false, 'error', 'tid_too_long');
  end if;

  select * into v_parcel from parcel where tid = p_tid for update;

  if v_parcel.tid is null then
    select * into v_import from parcel_import where tid = p_tid and consumed_at is null;

    insert into parcel (
      tid, parcel_category, current_stage, received_at,
      granular_status, cod_value, goods_value, insurance_value, xb_value_usd,
      pets_ticket_type, pets_ticket_subtype, pets_ticket_outcome,
      shipper_segment,
      cod_source, manual_value_item_description, value_source
    )
      values (
        p_tid, p_parcel_category, 'RECEIVED', now(),
        v_import.granular_status,
        v_import.cod_value,
        v_import.goods_value,
        v_import.insurance_value,
        v_import.xb_value_usd,
        v_import.pets_ticket_type,
        v_import.pets_ticket_subtype,
        v_import.pets_ticket_outcome,
        coalesce(normalize_shipper_segment(v_import.shipper_segment_raw), 'UNKNOWN'),
        case when v_import.cod_value is not null then 'CSV_IMPORT' end,
        v_import.item_description,
        case when v_import.tid is not null then 'CSV_IMPORT' end
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
    select * into v_bin_row from ref_output_bin where code = v_parcel.resolved_output_bin;
    return jsonb_build_object(
      'ok', true, 'tid', p_tid, 'duplicate', true, 'event_ts', v_existing_event.event_ts,
      'bin', v_parcel.resolved_output_bin, 'bin_label', v_bin_row.label, 'area', v_bin_row.area,
      'is_hvi', v_parcel.is_hvi
    );
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

create or replace function import_parcel_rows(p_rows jsonb) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_tid text;
  v_cod_value numeric;
  v_goods_value numeric;
  v_insurance_value numeric;
  v_xb_value_usd numeric;
  v_imported int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_affected int;
  v_ttxb_count int := 0;
  v_non_ttxb_count int := 0;
begin
  if current_app_role() not in ('warehouse_ops', 'recovery_team', 'owner') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_tid := nullif(trim(both from (v_row->>'tid')), '');

    if v_tid is null then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'missing_tid');
      continue;
    end if;

    if length(v_tid) > 30 then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'tid_too_long');
      continue;
    end if;

    begin
      v_cod_value := blank_or_zero(v_row->>'cod_value')::numeric;
      v_goods_value := blank_or_zero(v_row->>'goods_value')::numeric;
      v_insurance_value := blank_or_zero(v_row->>'insurance_value')::numeric;
      v_xb_value_usd := blank_or_zero(v_row->>'xb_value_usd')::numeric;
    exception when invalid_text_representation then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'invalid_numeric_value');
      continue;
    end;

    insert into parcel_import (
      tid, granular_status, cod_value, goods_value, insurance_value, xb_value_usd,
      pets_ticket_type, pets_ticket_subtype, pets_ticket_outcome, shipper_segment_raw,
      item_description, imported_by
    )
      values (
        v_tid,
        blank_or_zero(v_row->>'granular_status'),
        v_cod_value,
        v_goods_value,
        v_insurance_value,
        v_xb_value_usd,
        blank_or_zero(v_row->>'pets_ticket_type'),
        blank_or_zero(v_row->>'pets_ticket_subtype'),
        blank_or_zero(v_row->>'pets_ticket_outcome'),
        blank_or_zero(v_row->>'shipper_segment_raw'),
        nullif(nullif(trim(both from (v_row->>'item_description')), ''), '-'),
        auth.uid()
      )
    on conflict (tid) do update
      set granular_status = excluded.granular_status,
          cod_value = excluded.cod_value,
          goods_value = excluded.goods_value,
          insurance_value = excluded.insurance_value,
          xb_value_usd = excluded.xb_value_usd,
          pets_ticket_type = excluded.pets_ticket_type,
          pets_ticket_subtype = excluded.pets_ticket_subtype,
          pets_ticket_outcome = excluded.pets_ticket_outcome,
          shipper_segment_raw = excluded.shipper_segment_raw,
          item_description = excluded.item_description,
          imported_by = excluded.imported_by,
          imported_at = now()
      where parcel_import.consumed_at is null;

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'already_consumed');
      continue;
    end if;

    v_imported := v_imported + 1;
    if normalize_shipper_segment(v_row->>'shipper_segment_raw') = 'TTXB' then
      v_ttxb_count := v_ttxb_count + 1;
    else
      v_non_ttxb_count := v_non_ttxb_count + 1;
    end if;
  end loop;

  insert into csv_upload_log (uploaded_by, total_rows, imported_count, skipped_count, ttxb_count, non_ttxb_count)
    values (auth.uid(), jsonb_array_length(p_rows), v_imported, jsonb_array_length(v_skipped), v_ttxb_count, v_non_ttxb_count);

  return jsonb_build_object('ok', true, 'imported', v_imported, 'skipped', v_skipped);
end;
$$;
