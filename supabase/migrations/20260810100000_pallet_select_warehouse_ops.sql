-- Recent Scans' TID-locate feature and the Strip result column need warehouse_ops
-- to see which pallet a sack landed on (previously recovery_team/finance_team/owner
-- only). warehouse_ops already writes to pallet via record_pallet_outbound (Tab 8) —
-- this just extends read access to match that same floor-operations need.
create policy pallet_select_warehouse_ops on pallet for select to authenticated
  using (current_app_role() = 'warehouse_ops');
