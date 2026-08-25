-- New matchable column for output routing: the CSV import's "Name" column (e.g.
-- "Recovery TTDI RTS (RTS)") carries a recovery-process label PETS/Redash exports
-- that today's 5-column mapping rules (status/shipper/ticket type/subtype/outcome)
-- don't see at all. Joel wants this to act as an override — an exact match on
-- recovery_name always wins over any other rule for the same parcel, not just
-- "most columns matched" like the existing 5. Kept as its own column rather than
-- folded into the specific-match-count tiebreak (see V6) so that override semantics
-- don't get muddled with the normal ranking.
--
-- NOTE: the ADD COLUMN recovery_name statements (on output_mapping_rule,
-- parcel_import, parcel) that originally lived here are gone on purpose — this
-- migration failed twice before landing (once on ALTER...MODIFY of a generated
-- column, which OceanBase rejects outright), and DDL auto-commits per statement
-- regardless of the overall migration's failure, so those 3 columns already exist
-- live from the first failed attempt. Re-adding them here would just be a
-- duplicate-column error on redeploy. Only the statements that never successfully
-- ran remain below.
alter table output_mapping_rule drop column dedupe_key;
alter table output_mapping_rule add column dedupe_key varchar(700) generated always as (
  concat_ws(char(1), upload_id,
    coalesce(status, ''), coalesce(shipper, ''),
    coalesce(ticket_type, ''), coalesce(ticket_subtype, ''), coalesce(order_outcome, ''),
    coalesce(recovery_name, '')
  )
) stored;
alter table output_mapping_rule add unique key uq_output_mapping_rule_dedupe (dedupe_key);

insert into output_mapping_rule (upload_id, recovery_name, output_bin, needs_force_success) values
  (1, 'Recovery TTDI RTS (RTS)', 'A', false);
