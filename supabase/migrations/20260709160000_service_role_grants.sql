-- service_role bypasses RLS by default in Supabase, but RLS bypass and table-level
-- GRANTs are separate mechanisms — discovered the hard way when an admin-bootstrap
-- insert into `profile` using the service-role key failed with "permission denied"
-- even though RLS should have been irrelevant to it. With "Automatically expose new
-- tables" off, apparently neither anon/authenticated NOR service_role get implicit
-- privileges on new tables in this project, so service_role needs the same explicit
-- treatment as authenticated did in the previous migration.
--
-- service_role is the trusted server-only credential (PETS sync, Redash sync, and the
-- owner-only /admin/users route all use it) so, unlike the narrow per-table grants given
-- to authenticated, it gets full CRUD across the schema — that matches how service_role
-- is conventionally used in Supabase and avoids re-discovering this same failure mode
-- one table at a time as Phase 2+ adds more service-role-driven routes.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Cover tables created after this migration too, regardless of what creates them.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
