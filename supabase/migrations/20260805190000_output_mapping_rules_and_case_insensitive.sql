-- resolve_output_bin's rule match was exact-equality (case-sensitive), which breaks on
-- real-world data inconsistency confirmed against the sample-output/sample-mapping
-- tabs: the same "RESUME DELIVERY" outcome appears as both all-caps and
-- "RESUME Delivery" in real exports, and should be treated identically per Joel.
-- Made all five match fields case-insensitive rather than just order_outcome, since
-- there's no reason any of status/shipper/ticket_type/ticket_subtype should be
-- case-sensitive either and the risk of doing so is a silent F-fallback misroute.
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
    where (r.status is null or upper(r.status) = upper(v_parcel.granular_status))
      and (r.shipper is null or upper(r.shipper) = upper(v_parcel.shipper_segment))
      and (r.ticket_type is null or upper(r.ticket_type) = upper(v_parcel.pets_ticket_type))
      and (r.ticket_subtype is null or upper(r.ticket_subtype) = upper(v_parcel.pets_ticket_subtype))
      and (r.order_outcome is null or upper(r.order_outcome) = upper(v_parcel.pets_ticket_outcome))
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

-- Rules derived from Liquidation Prototype.xlsx, sample-output + sample-mapping tabs
-- only (mapping tab intentionally excluded — its STATUS vocabulary didn't match
-- sample-output's granular status at all, so it wasn't trustworthy as a source).
-- output_bin 'A'/'C' below is provisional — resolve_output_bin recomputes the actual
-- A-vs-B / C-vs-D letter from effective_value at scan time regardless of what's
-- stored on the rule, so either letter of the pair works identically here.

-- PARCEL EXCEPTION -> E (any status/subtype/outcome/segment; confirmed across 7 rows
-- spanning 4 different statuses, so ticket_type alone is what drives this one).
select add_output_mapping_rule(p_ticket_type := 'PARCEL EXCEPTION', p_output_bin := 'E');

-- DAMAGED with no other more specific rule below -> E (catches blank/unresolved
-- outcome, and any DAMAGED outcome not explicitly covered here).
select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_output_bin := 'E');

select add_output_mapping_rule(
  p_ticket_type := 'SHIPPER ISSUE', p_ticket_subtype := 'POOR PACKAGING',
  p_order_outcome := 'NV TO REPACK AND SHIP', p_output_bin := 'G'
);
select add_output_mapping_rule(
  p_ticket_type := 'SHIPPER ISSUE', p_ticket_subtype := 'POOR PACKAGING',
  p_order_outcome := 'NV NOT LIABLE - RETURN PARCEL', p_output_bin := 'G'
);

-- DAMAGED + a "disposed" outcome: TTXB -> D, everything else -> E. Confirmed the
-- driver is segment, not the LIABLE/NOT LIABLE wording (Joel confirmed directly) —
-- so both liability wordings are covered on both sides. Includes both the
-- inconsistent "LIABLE- " / "LIABLE - " spacing variants seen in the real sample.
select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_shipper := 'TTXB', p_order_outcome := 'NV LIABLE- PARCEL DISPOSED', p_output_bin := 'D');
select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_shipper := 'TTXB', p_order_outcome := 'NV LIABLE - PARCEL DISPOSED', p_output_bin := 'D');
select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_shipper := 'TTXB', p_order_outcome := 'NV NOT LIABLE - PARCEL DISPOSED', p_output_bin := 'D');
select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_order_outcome := 'NV LIABLE- PARCEL DISPOSED', p_output_bin := 'E');
select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_order_outcome := 'NV LIABLE - PARCEL DISPOSED', p_output_bin := 'E');
select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_order_outcome := 'NV NOT LIABLE - PARCEL DISPOSED', p_output_bin := 'E');

select add_output_mapping_rule(p_ticket_type := 'DAMAGED', p_shipper := 'TTXB', p_order_outcome := 'XMAS CAGE', p_output_bin := 'D');

select add_output_mapping_rule(p_ticket_type := 'SLA BREACH', p_order_outcome := 'NV LIABLE - XMAS CAGE (TIKTOK)', p_output_bin := 'D');
select add_output_mapping_rule(p_ticket_type := 'SLA BREACH', p_order_outcome := 'FOUND - INBOUND', p_output_bin := 'D');

select add_output_mapping_rule(
  p_ticket_type := 'SELF COLLECTION', p_shipper := 'TTXB',
  p_order_outcome := 'PARCEL SCRAPPED', p_output_bin := 'A'
);

-- Case-insensitive match (added above) means this one rule covers both "RESUME
-- DELIVERY" and "RESUME Delivery" as seen in the sample.
select add_output_mapping_rule(
  p_ticket_type := 'PARCEL ON HOLD', p_ticket_subtype := 'SHIPPER REQUEST',
  p_order_outcome := 'RESUME DELIVERY', p_output_bin := 'C'
);

-- NOT loaded: the sample's "no PETS ticket at all" rows (Non-TTXB, blank
-- type/subtype/outcome, routed to C/D by value via the xb_value*61.45 fallback).
-- The schema has no way to express "ticket_type IS NULL" as distinct from "wildcard,
-- matches any ticket_type" — a rule with all-null match fields would incorrectly
-- catch any future unmapped combination for that shipper, not just genuinely
-- ticketless parcels. Needs a schema change (e.g. a match_null_type flag) to load
-- safely; flagged to Joel rather than loading something that could misroute.
