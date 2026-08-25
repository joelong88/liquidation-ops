-- One-time reset for a fresh test cycle: clears all transactional/operational data
-- (parcels, sacks, pallets, batches, sales, event logs, sync/import staging) while
-- preserving reference/config data — ref_shipper_segment, ref_stage,
-- ref_parcel_category, ref_item_type, ref_output_bin, ref_config,
-- output_mapping_upload/rule (including the just-added recovery_name override), and
-- profile (real user accounts/roles) are all left untouched.
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
