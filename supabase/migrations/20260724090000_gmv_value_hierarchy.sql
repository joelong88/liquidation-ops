-- HVI threshold raised to 3000 PHP per Joel's direction (was 2000).
update ref_config set value_numeric = 3000, updated_at = now() where key = 'hvi_threshold_php';

-- New value fields feeding the corrected GMV/effective_value hierarchy: goods_value
-- (the courier's declared goods value) takes priority; if zero/unset, the higher of
-- cod_value/insurance_value; if all three are zero/unset, the cross-border USD value
-- converted to PHP at a fixed rate (61.45, per Joel — not a live FX feed, so a rate
-- change means a follow-up migration, not a config row, since it's stamped into the
-- generated column expression itself). manual_value (the existing NO-AWB manual-entry
-- fallback) stays the last resort underneath all of these, unchanged from before.
alter table parcel add column goods_value numeric(14,2);
alter table parcel add column insurance_value numeric(14,2);
alter table parcel add column xb_value_usd numeric(14,2);

alter table parcel drop column effective_value;
alter table parcel add column effective_value numeric(14,2) generated always as (
  case
    when coalesce(goods_value, 0) <> 0 then goods_value
    when greatest(coalesce(cod_value, 0), coalesce(insurance_value, 0)) <> 0
      then greatest(coalesce(cod_value, 0), coalesce(insurance_value, 0))
    when coalesce(xb_value_usd, 0) <> 0 then xb_value_usd * 61.45
    else manual_value
  end
) stored;

comment on column parcel.effective_value is
  'GMV hierarchy: goods_value, else greatest(cod_value, insurance_value), else
   xb_value_usd * 61.45 (fixed USD->PHP rate), else manual_value (NO-AWB fallback).';

-- resolve_output_bin now reads effective_value directly (the generated column above
-- already applies the full hierarchy) instead of re-deriving coalesce(cod_value,
-- manual_value) inline, which predated goods_value/insurance_value/xb_value_usd
-- entirely and silently ignored them for HVI classification.
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

  v_effective_value := v_parcel.effective_value;
  select value_numeric into v_threshold from ref_config where key = 'hvi_threshold_php';
  v_is_hvi := case when v_effective_value is null then null
                    else v_effective_value >= coalesce(v_threshold, 3000) end;

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

-- Tab 0 (Data Source) extended to carry the same three new fields, since it's the
-- only ingestion path for them today (no live COD/Redash sync exists yet).
alter table parcel_import add column goods_value numeric(14,2);
alter table parcel_import add column insurance_value numeric(14,2);
alter table parcel_import add column xb_value_usd numeric(14,2);

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
      v_cod_value := nullif(trim(both from (v_row->>'cod_value')), '')::numeric;
      v_goods_value := nullif(trim(both from (v_row->>'goods_value')), '')::numeric;
      v_insurance_value := nullif(trim(both from (v_row->>'insurance_value')), '')::numeric;
      v_xb_value_usd := nullif(trim(both from (v_row->>'xb_value_usd')), '')::numeric;
    exception when invalid_text_representation then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'invalid_numeric_value');
      continue;
    end;

    insert into parcel_import (
      tid, granular_status, cod_value, goods_value, insurance_value, xb_value_usd,
      item_description, imported_by
    )
      values (
        v_tid,
        nullif(trim(both from (v_row->>'granular_status')), ''),
        v_cod_value,
        v_goods_value,
        v_insurance_value,
        v_xb_value_usd,
        nullif(trim(both from (v_row->>'item_description')), ''),
        auth.uid()
      )
    on conflict (tid) do update
      set granular_status = excluded.granular_status,
          cod_value = excluded.cod_value,
          goods_value = excluded.goods_value,
          insurance_value = excluded.insurance_value,
          xb_value_usd = excluded.xb_value_usd,
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

-- record_first_scan now seeds all four value fields from a staged Tab-0 import row,
-- not just cod_value.
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
      cod_source, manual_value_item_description, value_source
    )
      values (
        p_tid, p_parcel_category, 'RECEIVED', now(),
        v_import.granular_status,
        v_import.cod_value,
        v_import.goods_value,
        v_import.insurance_value,
        v_import.xb_value_usd,
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
