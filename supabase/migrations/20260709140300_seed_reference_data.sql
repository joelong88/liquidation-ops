-- Seed data transcribed directly from the legacy workbook's "Reporting_Segment" and
-- "Status Mapping" sheets, so the mapping the business already trusts is imported
-- as-is rather than redesigned. See the Phase 1 plan for source-verification detail.

insert into ref_stage (code, seq_order, label, requires_hold_check) values
  ('RECEIVED',   1, 'Received',   false),
  ('STAMPED',    2, 'NV Stamped', false),
  ('IN_STORAGE', 3, 'In Storage', true),
  ('ENDORSED',   4, 'Endorsed',   false),
  ('BATCHED',    5, 'Batched',    false),
  ('SOLD',       6, 'Sold',       false),
  ('OUTGOING',   7, 'Outgoing',   false);

insert into ref_item_type (code, label) values
  ('STANDARD',   'Standard'),
  ('HVI',        'High-Value Item'),
  ('PHONE_CASE', 'Phone Case');

-- From Reporting_Segment sheet, "Joel's decision - New bucket" column (the currently
-- authoritative mapping), deduplicated to distinct buckets:
--   B2B -> B2B
--   Corp Sales / Corp Sales - Mailers / Corp Sales - Non Mailers / Field Sales /
--     Retail / Self Serve / Test -> Corp
--   Lazada / Partnerships -> Partnerships
--   TikTok -> TTPH
--   TikTok XB -> TTXB
--   Shein / Cross Border -> non TTXB
--   #NA -> null
insert into ref_shipper_segment (code, label, hold_days) values
  ('B2B',          'B2B',            0),
  ('CORP',         'Corp',           0),
  ('PARTNERSHIPS', 'Partnerships',   0),
  ('TTPH',         'TikTok PH',      0),
  ('TTXB',         'TikTok Crossborder', 7),   -- confirmed 7 days (not 30), see column comment
  ('NON_TTXB',     'Non-TikTok Crossborder', 0),
  ('UNKNOWN',      'Unclassified',   0);

-- From Status Mapping sheet's "Parcel Category" column, normalized to the 5 category
-- values actually observed in the live "1 Incoming" sheet (57,577 rows: LIQUIDATION
-- 82.5%, REPACK 11.1%, STAGING 2.9%, TICKET_CREATION 2.7%, INVESTIGATION 0.8%).
-- Where a category collapses more than one legacy status/sub-case (STAGING covers both
-- "Completed" and "On hold"; INVESTIGATION covers both partial- and total-damage), the
-- next_action captures the general case only, per this table's documented scope.
insert into ref_parcel_category (code, label, for_liquidation, next_action, outgoing_status_map) values
  ('LIQUIDATION',    'Liquidation',    true,  null,
    '-'),
  ('TICKET_CREATION','Ticket Creation',false, 'For RTS (back to sort)',
    'Staging'),
  ('STAGING',         'Staging',        false, 'Waiting for dispo (RTS, resume, or relabel depending on ticket)',
    'Staging'),
  ('INVESTIGATION',   'Investigation',  false, 'Repack and resume delivery, or disposal if total damage',
    'Damage Repack'),
  ('REPACK',          'Repack',         false, 'For resume delivery (back to sort)',
    'Repack');
