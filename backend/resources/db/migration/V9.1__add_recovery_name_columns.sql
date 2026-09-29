-- Compensating migration for any database that hasn't run V10 yet. V10 — as
-- currently written and already successfully applied on Production with a locked-in
-- checksum — assumes these columns already exist. They do on Production, left behind
-- by its own earlier failed-then-retried history (see V10's own comment), but a
-- brand-new database (e.g. a fresh Dev environment) never gets them added at all,
-- since V10's file content was fixed specifically for Production's partial state and
-- can't be edited again without breaking Production's already-recorded checksum.
--
-- Placing this at a version strictly between V9 and V10 means: a fresh database picks
-- it up before reaching V10 (making V10 succeed there exactly as it did on
-- Production); Production, already past V10, never attempts this file at all —
-- Flyway skips out-of-order migrations below the current version by default — so it
-- cannot collide with Production's frozen V10 checksum.
alter table output_mapping_rule add column recovery_name varchar(255) null;
alter table parcel_import add column recovery_name varchar(255) null;
alter table parcel add column recovery_name varchar(255) null;
