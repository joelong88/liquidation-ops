-- Second reset for a fresh test cycle (see V11 for the first) — same scope: clears
-- all transactional/operational data while preserving reference/config data
-- (ref_*, output_mapping_upload/rule, profile).
set foreign_key_checks = 0;
truncate table stage_event;
truncate table sack_event;
truncate table pallet_event;
truncate table sale;
truncate table expected_arrival;
truncate table cod_sync_snapshot;
truncate table sync_run;
truncate table parcel;
truncate table sack;
truncate table pallet;
truncate table batch;
truncate table noawb_seq;
truncate table parcel_import;
truncate table csv_upload_log;
set foreign_key_checks = 1;
