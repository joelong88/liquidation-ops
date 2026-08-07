-- Real bug: parcel_import/record_first_scan only ever carried granular_status and
-- the value fields — never Ticket Type/Subtype/Outcome/Shipper Segment, which is
-- exactly what every loaded output_mapping_rule matches on. Every CSV-imported
-- parcel had all four fields null, so nothing could ever match and every scan fell
-- through to bin F regardless of the rules being correct. Confirmed directly against
-- a real scanned TID (PHNJV00915110932): pets_ticket_type/subtype/outcome all null,
-- shipper_segment stuck at the UNKNOWN default.
alter table parcel_import add column pets_ticket_type text;
alter table parcel_import add column pets_ticket_subtype text;
alter table parcel_import add column pets_ticket_outcome text;
alter table parcel_import add column shipper_segment_raw text;

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

    begin
      v_cod_value := nullif(nullif(trim(both from (v_row->>'cod_value')), ''), '-')::numeric;
      v_goods_value := nullif(nullif(trim(both from (v_row->>'goods_value')), ''), '-')::numeric;
      v_insurance_value := nullif(nullif(trim(both from (v_row->>'insurance_value')), ''), '-')::numeric;
      v_xb_value_usd := nullif(nullif(trim(both from (v_row->>'xb_value_usd')), ''), '-')::numeric;
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
        nullif(nullif(trim(both from (v_row->>'granular_status')), ''), '-'),
        v_cod_value,
        v_goods_value,
        v_insurance_value,
        v_xb_value_usd,
        nullif(nullif(trim(both from (v_row->>'pets_ticket_type')), ''), '-'),
        nullif(nullif(trim(both from (v_row->>'pets_ticket_subtype')), ''), '-'),
        nullif(nullif(trim(both from (v_row->>'pets_ticket_outcome')), ''), '-'),
        nullif(nullif(trim(both from (v_row->>'shipper_segment_raw')), ''), '-'),
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
  end loop;

  return jsonb_build_object('ok', true, 'imported', v_imported, 'skipped', v_skipped);
end;
$$;

-- Normalizes free-text shipper segment spellings (as seen in the real workbook: "TTPH",
-- "TTXB", "Non-TTXB", "Corp Sales") into a valid ref_shipper_segment code — the parcel
-- table's shipper_segment is FK-constrained, so an unrecognized raw value must fall
-- back to UNKNOWN rather than fail the whole scan.
create or replace function normalize_shipper_segment(p_raw text) returns text
language sql
immutable
as $$
  select case upper(regexp_replace(coalesce(p_raw, ''), '[\s_-]+', '', 'g'))
    when 'TTPH' then 'TTPH'
    when 'TTXB' then 'TTXB'
    when 'NONTTXB' then 'NON_TTXB'
    when 'B2B' then 'B2B'
    when 'PARTNERSHIPS' then 'PARTNERSHIPS'
    when 'CORP' then 'CORP'
    when 'CORPSALES' then 'CORP'
    else 'UNKNOWN'
  end
$$;

-- record_first_scan now seeds the PETS ticket fields and a normalized shipper
-- segment from the staged import row, in addition to the value fields it already
-- seeded — these are what resolve_output_bin actually matches rules against.
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
