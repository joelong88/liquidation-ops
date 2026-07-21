-- M14: adds IN_LIQUIDATION_AREA, mirroring IN_STORAGE — set by Tab 5's TID+sack mode
-- (non-TTXB fresh arrivals) only. TTXB parcels arriving via pallet-consolidation
-- (assign_pallet) skip straight to ON_PALLET, same as before this migration.
-- Same zero-cost renumber technique as prior ref_stage migrations: seq_order is
-- reference-table-only metadata, not stored on any parcel/stage_event row.
--
-- Before: RECEIVED=1, STAMPED=2(inactive), IN_STORAGE=3, REPACKED=4, STRIPPED=5,
--         ON_PALLET=6, ENDORSED=7, BATCHED=8(inactive), SOLD=9, OUTGOING=10
-- After:  ...IN_STORAGE=3, IN_LIQUIDATION_AREA=4, REPACKED=5, STRIPPED=6, ON_PALLET=7,
--         ENDORSED=8, BATCHED=9(inactive), SOLD=10, OUTGOING=11

update ref_stage set seq_order = seq_order + 1000
  where code in ('REPACKED','STRIPPED','ON_PALLET','ENDORSED','BATCHED','SOLD','OUTGOING');

insert into ref_stage (code, seq_order, label, requires_hold_check) values
  ('IN_LIQUIDATION_AREA', 4, 'In Liquidation area', false);

update ref_stage set seq_order = case code
    when 'REPACKED'  then 5
    when 'STRIPPED'  then 6
    when 'ON_PALLET' then 7
    when 'ENDORSED'  then 8
    when 'BATCHED'   then 9
    when 'SOLD'      then 10
    when 'OUTGOING'  then 11
  end
  where code in ('REPACKED','STRIPPED','ON_PALLET','ENDORSED','BATCHED','SOLD','OUTGOING');
