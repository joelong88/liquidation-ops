-- New terminal stage for parcels found damaged/leaking when a closed sack is opened
-- for stripping. Scanning one out here clears its sack_id (same pattern as REPACKED)
-- so it's naturally excluded from strip_sack's bulk-advance and assign_pallet's
-- sack-based consolidation — no changes needed to either of those.
insert into ref_stage (code, seq_order, label, requires_hold_check, is_active) values
  ('DAMAGED', 12, 'Damaged (excluded from sale)', false, true);

alter table parcel add column damaged_at datetime(6) null;
alter table parcel add column damaged_by varchar(255) null;
alter table parcel add column damage_reason text null;
