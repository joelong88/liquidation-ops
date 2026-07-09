-- Row-Level Security for the 4 roles (warehouse_ops, recovery_team, finance_team, owner).
-- Sync jobs (PETS, Redash) run server-side with the Supabase service-role key and bypass
-- RLS entirely by design — they are not meant to be reachable via an authenticated
-- end-user session, so expected_arrival/cod_sync_snapshot/sync_run get no write policies
-- for the 4 app roles below, only select (so the admin dashboard can read sync health).

create function current_role() returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profile where id = auth.uid()
$$;

-- profile ---------------------------------------------------------------
alter table profile enable row level security;

create policy profile_select_self_or_owner on profile
  for select to authenticated
  using (id = auth.uid() or current_role() = 'owner');
-- No insert/update/delete policy for authenticated users: role assignment is done
-- server-side via the service-role key from the owner-only /admin/users route,
-- not via direct client table writes.

-- ref_* tables: read-only reference data, safe to expose to any authenticated user ----
alter table ref_shipper_segment enable row level security;
alter table ref_stage enable row level security;
alter table ref_parcel_category enable row level security;
alter table ref_item_type enable row level security;

create policy ref_shipper_segment_select_all on ref_shipper_segment for select to authenticated using (true);
create policy ref_stage_select_all on ref_stage for select to authenticated using (true);
create policy ref_parcel_category_select_all on ref_parcel_category for select to authenticated using (true);
create policy ref_item_type_select_all on ref_item_type for select to authenticated using (true);

-- parcel ------------------------------------------------------------------
alter table parcel enable row level security;

create policy parcel_select_all on parcel for select to authenticated using (true);

create policy parcel_insert_ops on parcel for insert to authenticated
  with check (current_role() in ('warehouse_ops','recovery_team','owner'));

create policy parcel_update_ops on parcel for update to authenticated
  using (current_role() in ('warehouse_ops','recovery_team','owner'));

-- stage_event ---------------------------------------------------------------
alter table stage_event enable row level security;

create policy stage_event_select_all on stage_event for select to authenticated using (true);

create policy stage_event_insert_ops on stage_event for insert to authenticated
  with check (current_role() in ('warehouse_ops','recovery_team','owner'));

-- batch -----------------------------------------------------------------
alter table batch enable row level security;

create policy batch_select_recovery_finance_owner on batch for select to authenticated
  using (current_role() in ('recovery_team','finance_team','owner'));

create policy batch_insert_recovery on batch for insert to authenticated
  with check (current_role() in ('recovery_team','owner'));

create policy batch_update_recovery on batch for update to authenticated
  using (current_role() in ('recovery_team','owner'));

-- sale --------------------------------------------------------------------
alter table sale enable row level security;

create policy sale_select_recovery_finance_owner on sale for select to authenticated
  using (current_role() in ('recovery_team','finance_team','owner'));

create policy sale_insert_finance on sale for insert to authenticated
  with check (current_role() in ('finance_team','owner'));

create policy sale_update_finance on sale for update to authenticated
  using (current_role() in ('finance_team','owner'));

-- sync observability tables: read-only for authenticated users, writes are service-role only
alter table expected_arrival enable row level security;
alter table cod_sync_snapshot enable row level security;
alter table sync_run enable row level security;

create policy expected_arrival_select_all on expected_arrival for select to authenticated using (true);
create policy cod_sync_snapshot_select_all on cod_sync_snapshot for select to authenticated using (true);
create policy sync_run_select_all on sync_run for select to authenticated using (true);
