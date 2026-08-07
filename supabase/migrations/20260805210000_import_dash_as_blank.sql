-- Joel's own exports use "-" as the placeholder for "no value" in numeric columns
-- (confirmed throughout the Liquidation Prototype sample-output tab) — the numeric
-- parser only treated a truly empty string as blank, so "-" was hitting the numeric
-- cast and getting skipped as invalid_numeric_value instead of just importing as null.
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
      item_description, imported_by
    )
      values (
        v_tid,
        nullif(nullif(trim(both from (v_row->>'granular_status')), ''), '-'),
        v_cod_value,
        v_goods_value,
        v_insurance_value,
        v_xb_value_usd,
        nullif(nullif(trim(both from (v_row->>'item_description')), ''), '-'),
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
