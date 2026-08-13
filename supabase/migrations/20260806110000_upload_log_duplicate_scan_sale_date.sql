-- Tab 0: historical log of CSV uploads (date, uploader, TID counts split TTXB vs
-- non-TTXB). One row per import_parcel_rows call, not per TID.
create table csv_upload_log (
  upload_id bigserial primary key,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id),
  total_rows int not null default 0,
  imported_count int not null default 0,
  skipped_count int not null default 0,
  ttxb_count int not null default 0,
  non_ttxb_count int not null default 0
);

grant select, insert on csv_upload_log to authenticated;
grant usage, select on csv_upload_log_upload_id_seq to authenticated;
alter table csv_upload_log enable row level security;

create policy csv_upload_log_select_all on csv_upload_log for select to authenticated using (true);
create policy csv_upload_log_insert_ops on csv_upload_log for insert to authenticated
  with check (current_app_role() in ('warehouse_ops', 'recovery_team', 'owner'));

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

-- record_first_scan: on a duplicate scan, keep showing the already-resolved bin
-- (rather than just a bare error) plus a flag the frontend uses to show a "already
-- scanned before" notice alongside it.
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

-- Sale date: distinct from payment_date (when payment was actually received) —
-- this is the date the deal/sale itself was made.
alter table sale add column sale_date date not null default current_date;

-- create or replace can't change a function's argument list (adding a trailing
-- defaulted param creates a distinct overload instead of replacing it, which would
-- leave both the old 3-arg and new 4-arg versions callable and ambiguous) — drop the
-- old signature explicitly first.
drop function if exists record_batch_sale(bigint, text, numeric);

create or replace function record_batch_sale(
  p_batch_id bigint,
  p_buyer_name text,
  p_sale_amount numeric,
  p_sale_date date default current_date
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_sale_amount is null or p_sale_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if p_buyer_name is null or length(trim(p_buyer_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'buyer_name_required');
  end if;

  begin
    insert into sale (batch_id, channel, buyer_name, sale_amount, sale_date, created_by)
      values (p_batch_id, 'EXTERNAL_AUCTION', p_buyer_name, p_sale_amount, coalesce(p_sale_date, current_date), auth.uid());
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_sold');
  end;

  update batch set status = 'SOLD', updated_at = now() where batch_id = p_batch_id;

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists record_pallet_sale(bigint[], text, numeric, bigint);

create or replace function record_pallet_sale(
  p_pallet_ids bigint[],
  p_buyer_name text,
  p_sale_amount numeric,
  p_batch_id bigint default null,
  p_sale_date date default current_date
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id bigint;
  v_next_batch_number int;
  v_pallet_id bigint;
  v_pallet pallet%rowtype;
  v_sold bigint[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_sale_result jsonb;
begin
  if p_batch_id is null then
    select coalesce(max(batch_number), 0) + 1 into v_next_batch_number from batch;
    insert into batch (batch_number, batch_type, status, month, created_by)
      values (v_next_batch_number, 'STANDARD', 'OPEN', date_trunc('month', now())::date, auth.uid())
      returning batch_id into v_batch_id;
  else
    v_batch_id := p_batch_id;
  end if;

  foreach v_pallet_id in array p_pallet_ids loop
    select * into v_pallet from pallet where pallet_id = v_pallet_id for update;

    if v_pallet.pallet_id is null then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_found');
      continue;
    end if;
    if v_pallet.status <> 'ENDORSED' then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_endorsed');
      continue;
    end if;
    if v_pallet.batch_id is not null then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'already_batched');
      continue;
    end if;

    update pallet set batch_id = v_batch_id, updated_at = now() where pallet_id = v_pallet_id;
    update parcel set batch_id = v_batch_id, updated_at = now() where pallet_id = v_pallet_id;

    v_sold := v_sold || v_pallet_id;
  end loop;

  if array_length(v_sold, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'no_eligible_pallets', 'skipped', v_skipped);
  end if;

  perform recompute_batch_pricing(v_batch_id);
  v_sale_result := record_batch_sale(v_batch_id, p_buyer_name, p_sale_amount, p_sale_date);

  if not (v_sale_result->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'error', v_sale_result->>'error', 'batch_id', v_batch_id);
  end if;

  update pallet set status = 'SOLD', updated_at = now() where pallet_id = any(v_sold);
  update parcel set current_stage = 'SOLD', updated_at = now() where pallet_id = any(v_sold);

  return jsonb_build_object(
    'ok', true, 'batch_id', v_batch_id, 'sold_pallets', to_jsonb(v_sold), 'skipped', v_skipped
  );
end;
$$;

grant execute on function record_batch_sale(bigint, text, numeric, date) to authenticated;
grant execute on function record_pallet_sale(bigint[], text, numeric, bigint, date) to authenticated;
