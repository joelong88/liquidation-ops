-- Case 2 (WNJPH00925611987, from 23sep.xlsx): status=Cancelled + ticket_type=MISSING +
-- order_outcome='LOST - DECLARED' -> Liquidation area, split by item value (bin C
-- auto-resolves to D for low value, per Joel's stated logic).
insert into output_mapping_rule (upload_id, status, ticket_type, order_outcome, output_bin, needs_force_success) values
  (1, 'Cancelled', 'MISSING', 'LOST - DECLARED', 'C', false);
