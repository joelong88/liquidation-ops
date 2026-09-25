-- order_tags is a pipe-delimited list ("AIR | REC REQ | TTDI | US-10"), unlike every
-- other matchable column which is a single value — a rule's required_tag (when set)
-- matches if the parcel's order_tags CONTAINS that tag as a substring, not equality.
-- Participates in the normal specific-match-count ranking (not an override tier like
-- recovery_name) since Joel's stated logic combines it with status, the way any
-- other two-column rule would.
alter table output_mapping_rule add column required_tag varchar(100) null;
alter table parcel_import add column order_tags varchar(255) null;
alter table parcel add column order_tags varchar(255) null;

-- Drop + recreate rather than MODIFY (OceanBase rejects ALTER...MODIFY on a
-- generated column definition, error 1235 — see V10).
alter table output_mapping_rule drop column dedupe_key;
alter table output_mapping_rule add column dedupe_key varchar(700) generated always as (
  concat_ws(char(1), upload_id,
    coalesce(status, ''), coalesce(shipper, ''),
    coalesce(ticket_type, ''), coalesce(ticket_subtype, ''), coalesce(order_outcome, ''),
    coalesce(recovery_name, ''), coalesce(required_tag, '')
  )
) stored;
alter table output_mapping_rule add unique key uq_output_mapping_rule_dedupe (dedupe_key);

-- Case 3 (PHNJV00919347359): status=Cancelled + order_tags contains "REC REQ" ->
-- Liquidation area, split by item value (bin C auto-resolves to D for low value).
insert into output_mapping_rule (upload_id, status, required_tag, output_bin, needs_force_success) values
  (1, 'Cancelled', 'REC REQ', 'C', false);
