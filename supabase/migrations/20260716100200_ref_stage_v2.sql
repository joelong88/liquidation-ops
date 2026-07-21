-- Phase 2 stage model: only RECEIVED remains a genuinely per-TID scanned gate.
-- Everything from IN_STORAGE onward is now a bulk rollup written by the sack/pallet
-- RPCs (20260716100300_intake_scan_functions.sql onward), denormalized onto
-- parcel.current_stage. STAMPED/BATCHED are deactivated, not deleted: no live data
-- references them (endorse_parcels_to_batch sets 'ENDORSED' directly, never 'BATCHED';
-- record_batch_sale never touches parcel.current_stage at all), but deleting risks
-- historical FK data and isn't necessary for a purely additive redesign.

alter table ref_stage add column is_active boolean not null default true;

comment on column ref_stage.is_active is
  'Mirrors ref_shipper_segment.is_active. New scan/RPC code should stop emitting a '
  'stage once inactive; historical stage_event rows referencing it stay valid (FK, '
  'not deleted).';

update ref_stage set is_active = false where code in ('STAMPED', 'BATCHED');

-- Renumber seq_order to fit REPACKED/STRIPPED/ON_PALLET into the real flow position
-- (between IN_STORAGE and ENDORSED). This only touches the small ref_stage config
-- table, not parcel/stage_event — seq_order isn't stored on any historical row, so
-- renumbering has zero data-migration cost. Old: RECEIVED=1,STAMPED=2,IN_STORAGE=3,
-- ENDORSED=4,BATCHED=5,SOLD=6,OUTGOING=7. New: same first 3, then
-- REPACKED=4,STRIPPED=5,ON_PALLET=6,ENDORSED=7,BATCHED=8,SOLD=9,OUTGOING=10.
-- Done via a temporary +1000 offset to avoid transient collisions with the unique
-- index, since 4-7 are occupied by the codes being renumbered.
update ref_stage set seq_order = seq_order + 1000
  where code in ('ENDORSED','BATCHED','SOLD','OUTGOING');

insert into ref_stage (code, seq_order, label, requires_hold_check) values
  ('REPACKED',   4, 'Repacked (exception)',     false),
  ('STRIPPED',   5, 'Stripped',                 false),
  ('ON_PALLET',  6, 'Consolidated onto pallet', false);

update ref_stage set seq_order = seq_order - 997
  where code in ('ENDORSED','BATCHED','SOLD','OUTGOING');
