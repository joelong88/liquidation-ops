-- New matchable column for output routing: the CSV import's "Name" column (e.g.
-- "Recovery TTDI RTS (RTS)") carries a recovery-process label PETS/Redash exports
-- that today's 5-column mapping rules (status/shipper/ticket type/subtype/outcome)
-- don't see at all. Joel wants this to act as an override — an exact match on
-- recovery_name always wins over any other rule for the same parcel, not just
-- "most columns matched" like the existing 5. Kept as its own column rather than
-- folded into the specific-match-count tiebreak (see V6) so that override semantics
-- don't get muddled with the normal ranking.
--
-- The three ADD COLUMN statements below are guarded by an information_schema check
-- rather than plain ALTER TABLE — this migration failed twice on Production before
-- landing (once on ALTER...MODIFY of a generated column, which OceanBase rejects
-- outright), and because DDL auto-commits per statement regardless of the overall
-- migration's failure, those 3 columns already existed live on Production by the
-- time a fixed version of this file ran there. A later fresh database (e.g. a new
-- Dev environment) never gets them added at all if the ADD COLUMN statements are
-- simply removed — this migration's checksum is already locked in by Production's
-- successful history, so the fix has to be "correct regardless of starting state,"
-- not "correct for one specific environment." PREPARE/EXECUTE is used instead of
-- `ADD COLUMN IF NOT EXISTS` since that's core SQL rather than a newer convenience
-- syntax OceanBase may not implement (see the MODIFY COLUMN rejection above).
set @col_exists := (
  select count(*) from information_schema.columns
   where table_schema = database() and table_name = 'output_mapping_rule' and column_name = 'recovery_name'
);
set @ddl := if(@col_exists = 0,
  'alter table output_mapping_rule add column recovery_name varchar(255) null',
  'select 1'
);
prepare stmt from @ddl;
execute stmt;
deallocate prepare stmt;

set @col_exists := (
  select count(*) from information_schema.columns
   where table_schema = database() and table_name = 'parcel_import' and column_name = 'recovery_name'
);
set @ddl := if(@col_exists = 0,
  'alter table parcel_import add column recovery_name varchar(255) null',
  'select 1'
);
prepare stmt from @ddl;
execute stmt;
deallocate prepare stmt;

set @col_exists := (
  select count(*) from information_schema.columns
   where table_schema = database() and table_name = 'parcel' and column_name = 'recovery_name'
);
set @ddl := if(@col_exists = 0,
  'alter table parcel add column recovery_name varchar(255) null',
  'select 1'
);
prepare stmt from @ddl;
execute stmt;
deallocate prepare stmt;

-- Recompute the dedupe key to include the new column, so two override rules with
-- the same recovery_name (and otherwise-null columns) for the same upload still
-- collide as duplicates the way the original 5-column combo already does.
-- OceanBase rejects ALTER ... MODIFY COLUMN on a generated column definition
-- (error 1235), so drop and recreate it instead of modifying in place — dropping
-- the column also drops its unique index automatically, so that's recreated too.
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
