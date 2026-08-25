-- New matchable column for output routing: the CSV import's "Name" column (e.g.
-- "Recovery TTDI RTS (RTS)") carries a recovery-process label PETS/Redash exports
-- that today's 5-column mapping rules (status/shipper/ticket type/subtype/outcome)
-- don't see at all. Joel wants this to act as an override — an exact match on
-- recovery_name always wins over any other rule for the same parcel, not just
-- "most columns matched" like the existing 5. Kept as its own column rather than
-- folded into the specific-match-count tiebreak (see V6) so that override semantics
-- don't get muddled with the normal ranking.
alter table output_mapping_rule add column recovery_name varchar(255) null;
alter table parcel_import add column recovery_name varchar(255) null;
alter table parcel add column recovery_name varchar(255) null;

-- Recompute the dedupe key to include the new column, so two override rules with
-- the same recovery_name (and otherwise-null columns) for the same upload still
-- collide as duplicates the way the original 5-column combo already does.
alter table output_mapping_rule modify column dedupe_key varchar(700) generated always as (
  concat_ws(char(1), upload_id,
    coalesce(status, ''), coalesce(shipper, ''),
    coalesce(ticket_type, ''), coalesce(ticket_subtype, ''), coalesce(order_outcome, ''),
    coalesce(recovery_name, '')
  )
) stored;

insert into output_mapping_rule (upload_id, recovery_name, output_bin, needs_force_success) values
  (1, 'Recovery TTDI RTS (RTS)', 'A', false);
