-- Hand-ported directly from the live Supabase project's `profile` table — the ~7
-- real accounts, now keyed by email instead of a Supabase auth.users id. This is the
-- one-time cutover of real (non-seed) data this migration set touches; everything
-- else in V1-V7 is reference/config data or an empty schema.

insert into profile (email, role, full_name, is_active) values
  ('joel@ninjavan.co',                 'owner',         'Joel Ong', true),
  ('cindy.perlas@ninjavan.co',         'recovery_team', 'cindy',    true),
  ('joelina.deguzman@ninjavan.co',     'recovery_team', 'joelina',  true),
  ('ronald.ramirez@ninjavan.co',       'recovery_team', 'trev',     true),
  ('demo-warehouse@liquidation-ops.dev', 'warehouse_ops', 'Demo Warehouse', true),
  ('demo-recovery@liquidation-ops.dev',  'recovery_team', 'Demo Recovery',  true),
  ('demo-finance@liquidation-ops.dev',   'finance_team',  'Demo Finance',   true);
