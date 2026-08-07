-- Bug: parcel_import only ever got select/insert grants and RLS policies, but
-- import_parcel_rows does "insert ... on conflict (tid) do update set ..." — Postgres
-- requires UPDATE privilege on the target table for that statement to even parse-check
-- successfully, regardless of whether any row actually conflicts at runtime. Every
-- CSV upload was failing with a raw "permission denied for table parcel_import"
-- before it ever reached the RPC's own role check.
grant update on parcel_import to authenticated;

create policy parcel_import_update_ops on parcel_import for update to authenticated
  using (current_app_role() in ('warehouse_ops', 'recovery_team', 'owner'))
  with check (current_app_role() in ('warehouse_ops', 'recovery_team', 'owner'));
