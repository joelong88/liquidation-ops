-- Bug #1: some real exports encode a blank/unresolved PETS outcome as the literal
-- text "0" (an Excel artifact from an empty formula cell), not "-" or empty string.
-- Confirmed on WNJPH00920174771: pets_ticket_outcome came through as the string "0"
-- instead of null, so it couldn't match any rule's wildcard (which only applies
-- when the rule's own field is null, not when the parcel's field is the string "0").
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
        nullif(nullif(nullif(trim(both from (v_row->>'granular_status')), ''), '-'), '0'),
        v_cod_value,
        v_goods_value,
        v_insurance_value,
        v_xb_value_usd,
        nullif(nullif(nullif(trim(both from (v_row->>'pets_ticket_type')), ''), '-'), '0'),
        nullif(nullif(nullif(trim(both from (v_row->>'pets_ticket_subtype')), ''), '-'), '0'),
        nullif(nullif(nullif(trim(both from (v_row->>'pets_ticket_outcome')), ''), '-'), '0'),
        nullif(nullif(nullif(trim(both from (v_row->>'shipper_segment_raw')), ''), '-'), '0'),
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

-- Bug #2: genuine gap in the original 15 loaded rules. sample-output has
-- ('Cancelled', 'SLA BREACH', -, blank/0 outcome, 'TTXB') -> D, which I identified
-- during analysis but never actually turned into a rule. SLA BREACH -> D held across
-- every outcome variant seen in the sample regardless of segment (TTPH and TTXB both
-- confirmed), so this is a catch-all, same pattern as the existing DAMAGED -> E
-- catch-all — the two specific-outcome SLA BREACH rules stay in place and still win
-- on a tie since they're more specific.
select add_output_mapping_rule(p_ticket_type := 'SLA BREACH', p_output_bin := 'D');
