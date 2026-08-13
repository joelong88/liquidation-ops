-- profile was select-self-or-owner only, which breaks "who scanned this" visibility
-- on Scan History for anyone but the owner (a warehouse_ops/recovery_team viewer
-- couldn't resolve any other account's name). profile only carries id/role/full_name/
-- is_active — nothing sensitive (email/auth lives in auth.users, not here) — so
-- widening to the same "operational, no $" visibility already used for
-- sack/stage_event/parcel is consistent, not a new exposure.
drop policy profile_select_self_or_owner on profile;
create policy profile_select_all on profile for select to authenticated using (true);
