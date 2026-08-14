-- Seed data hand-ported directly from the live Supabase project (queried, not
-- replayed from migration history) — this is the one-time cutover of the small
-- reference/config tables; the ~7 real profile rows are ported separately by hand
-- once Phase C's email-keyed auth model is in place, not part of this schema port.

insert into ref_shipper_segment (code, label, hold_days, is_active) values
  ('B2B',          'B2B',                      0, true),
  ('CORP',         'Corp',                     0, true),
  ('NON_TTXB',     'Non-TikTok Crossborder',   0, true),
  ('PARTNERSHIPS', 'Partnerships',             0, true),
  ('TTPH',         'TikTok PH',                0, true),
  ('TTXB',         'TikTok Crossborder',       7, true),
  ('UNKNOWN',      'Unclassified',             0, true);

insert into ref_stage (code, seq_order, label, requires_hold_check, is_active) values
  ('RECEIVED',             1,  'Received',                  false, true),
  ('STAMPED',              2,  'NV Stamped',                false, false),
  ('IN_STORAGE',           3,  'In Storage',                true,  true),
  ('IN_LIQUIDATION_AREA',  4,  'In Liquidation area',       false, true),
  ('REPACKED',             5,  'Repacked (exception)',      false, true),
  ('STRIPPED',             6,  'Stripped',                  false, true),
  ('ON_PALLET',            7,  'Consolidated onto pallet',  false, true),
  ('ENDORSED',             8,  'Endorsed',                  false, true),
  ('BATCHED',              9,  'Batched',                   false, false),
  ('SOLD',                 10, 'Sold',                      false, true),
  ('OUTGOING',             11, 'Outgoing',                  false, true);

insert into ref_parcel_category (code, label, for_liquidation, next_action, outgoing_status_map) values
  ('LIQUIDATION',     'Liquidation',      true,  null,
    '-'),
  ('REPACK',          'Repack',           false, 'For resume delivery (back to sort)',
    'Repack'),
  ('STAGING',          'Staging',         false, 'Waiting for dispo (RTS, resume, or relabel depending on ticket)',
    'Staging'),
  ('TICKET_CREATION', 'Ticket Creation',  false, 'For RTS (back to sort)',
    'Staging'),
  ('INVESTIGATION',   'Investigation',    false, 'Repack and resume delivery, or disposal if total damage',
    'Damage Repack');

insert into ref_item_type (code, label) values
  ('STANDARD',   'Standard'),
  ('HVI',        'High-Value Item'),
  ('PHONE_CASE', 'Phone Case');

insert into ref_output_bin (code, label, area, is_hvi) values
  ('A', 'TTXB Storage — HVI',           'STORAGE',     true),
  ('B', 'TTXB Storage — Non-HVI',       'STORAGE',     false),
  ('C', 'Liquidation area — HVI',       'LIQUIDATION', true),
  ('D', 'Liquidation area — Non-HVI',   'LIQUIDATION', false),
  ('E', 'Move to rec area',             null,          false),
  ('F', 'ERROR / ticket creation',      null,          false),
  ('G', 'Repack & return to sort',      null,          false);

insert into ref_config (`key`, value_numeric, value_text, label) values
  ('hvi_threshold_php', 3000, null, 'HVI classification threshold (₱)');

insert into output_mapping_upload (upload_id, source, is_active) values (1, 'manual', true);

insert into output_mapping_rule (upload_id, status, shipper, ticket_type, ticket_subtype, order_outcome, output_bin, needs_force_success) values
  (1, null, null,   'PARCEL EXCEPTION', null,               null,                              'E', false),
  (1, null, null,   'DAMAGED',          null,               null,                              'E', false),
  (1, null, null,   'SHIPPER ISSUE',    'POOR PACKAGING',   'NV TO REPACK AND SHIP',            'G', false),
  (1, null, null,   'SHIPPER ISSUE',    'POOR PACKAGING',   'NV NOT LIABLE - RETURN PARCEL',    'G', false),
  (1, null, 'TTXB', 'DAMAGED',          null,               'NV LIABLE- PARCEL DISPOSED',       'D', false),
  (1, null, 'TTXB', 'DAMAGED',          null,               'NV LIABLE - PARCEL DISPOSED',      'D', false),
  (1, null, 'TTXB', 'DAMAGED',          null,               'NV NOT LIABLE - PARCEL DISPOSED',  'D', false),
  (1, null, null,   'DAMAGED',          null,               'NV LIABLE- PARCEL DISPOSED',       'E', false),
  (1, null, null,   'DAMAGED',          null,               'NV LIABLE - PARCEL DISPOSED',      'E', false),
  (1, null, null,   'DAMAGED',          null,               'NV NOT LIABLE - PARCEL DISPOSED',  'E', false),
  (1, null, 'TTXB', 'DAMAGED',          null,               'XMAS CAGE',                        'D', false),
  (1, null, null,   'SLA BREACH',       null,               'NV LIABLE - XMAS CAGE (TIKTOK)',   'D', false),
  (1, null, null,   'SLA BREACH',       null,               'FOUND - INBOUND',                  'D', false),
  (1, null, 'TTXB', 'SELF COLLECTION',  null,               'PARCEL SCRAPPED',                  'A', false),
  (1, null, null,   'PARCEL ON HOLD',   'SHIPPER REQUEST',  'RESUME DELIVERY',                  'C', false),
  (1, null, null,   'SLA BREACH',       null,               null,                                'D', false);
