-- RLS for the Phase 2 tables, following the exact two-layer rule established in
-- 20260709140200_rls_policies.sql: "Automatically expose new tables" is off, so a
-- table has zero API access until BOTH a grant and a passing policy allow it. Every
-- policy below has a matching grant, or the app gets silent permission-denied.
--
-- Visibility mirrors the existing split: sack/sack_event are operational (no $),
-- visible to all authenticated users like parcel/stage_event. pallet/pallet_event are
-- sale-adjacent (carry batch_id once sold), visible to recovery_team/finance_team/
-- owner like batch/sale. Writes happen via the SECURITY INVOKER RPCs (Phase 2), which
-- still run as the calling user — the insert/update policies below are what actually
-- permits those RPCs' writes, narrowed to the roles allowed to call them.

-- sack / sack_event --------------------------------------------------------
grant select, insert, update on sack to authenticated;
grant select, insert on sack_event to authenticated;

alter table sack enable row level security;
alter table sack_event enable row level security;

create policy sack_select_all on sack for select to authenticated using (true);

create policy sack_insert_ops on sack for insert to authenticated
  with check (current_app_role() in ('warehouse_ops','recovery_team','owner'));

create policy sack_update_ops on sack for update to authenticated
  using (current_app_role() in ('warehouse_ops','recovery_team','owner'));

create policy sack_event_select_all on sack_event for select to authenticated using (true);

create policy sack_event_insert_ops on sack_event for insert to authenticated
  with check (current_app_role() in ('warehouse_ops','recovery_team','owner'));

-- pallet / pallet_event -----------------------------------------------------
grant select, insert, update on pallet to authenticated;
grant select, insert on pallet_event to authenticated;

alter table pallet enable row level security;
alter table pallet_event enable row level security;

create policy pallet_select_recovery_finance_owner on pallet for select to authenticated
  using (current_app_role() in ('recovery_team','finance_team','owner'));

-- insert/update cover both recovery_team's assembly/endorsement/sale RPCs (M10) and
-- warehouse_ops' outbound scan (record_pallet_outbound, M10) — same "ops can scan,
-- recovery can manage" split as parcel/stage_event vs. batch.
create policy pallet_insert_recovery on pallet for insert to authenticated
  with check (current_app_role() in ('recovery_team','owner'));

create policy pallet_update_ops_recovery on pallet for update to authenticated
  using (current_app_role() in ('warehouse_ops','recovery_team','owner'));

create policy pallet_event_select_recovery_finance_owner on pallet_event for select to authenticated
  using (current_app_role() in ('recovery_team','finance_team','owner'));

create policy pallet_event_insert_ops_recovery on pallet_event for insert to authenticated
  with check (current_app_role() in ('warehouse_ops','recovery_team','owner'));
