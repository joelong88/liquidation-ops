-- Second recovery_name override, same pattern as V10's "Recovery TTDI RTS (RTS)":
-- "RTS-Tiktok XB DI RTS" is another consignee-name value seen in real exports that
-- should route to TTXB Storage (A/B, split by item value) regardless of whether its
-- ticket-type/subtype/outcome combo happens to match an existing rule.
insert into output_mapping_rule (upload_id, recovery_name, output_bin, needs_force_success) values
  (1, 'RTS-Tiktok XB DI RTS', 'A', false);
