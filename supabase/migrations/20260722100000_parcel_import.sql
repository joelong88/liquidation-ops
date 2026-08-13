-- Tab 0: Data Source. A manual, CSV-driven stand-in for the never-built PETS/Redash
-- syncs (Phase 1 Open Risks #2/#3) — Joel uploads a list of TIDs expected to arrive,
-- along with the fields resolve_output_bin actually needs to match on (granular_status)
-- plus value/description. Keyed by tid but does NOT reference parcel(tid) — the whole
-- point is these TIDs usually don't have a parcel row yet. record_first_scan (next
-- migration) consumes a row here when the real physical scan happens.
create table parcel_import (
  tid               text primary key,
  granular_status   text,
  cod_value         numeric(14,2),
  item_description  text,
  imported_by       uuid references auth.users(id),
  imported_at       timestamptz not null default now(),
  consumed_at       timestamptz
);
create index idx_parcel_import_pending on parcel_import(imported_at) where consumed_at is null;

grant select, insert on parcel_import to authenticated;
alter table parcel_import enable row level security;

create policy parcel_import_select_all on parcel_import for select to authenticated using (true);
create policy parcel_import_insert_ops on parcel_import for insert to authenticated
  with check (current_app_role() in ('warehouse_ops', 'recovery_team', 'owner'));

-- Bulk upsert, same skip-with-reason-per-item convention as assign_pallet/
-- endorse_pallets_to_admin rather than aborting the whole CSV on one bad row.
-- Re-uploading a TID that hasn't been consumed yet (no first scan) refreshes its data;
-- a TID already consumed keeps its historical row untouched.
create or replace function import_parcel_rows(p_rows jsonb) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_tid text;
  v_cod_value numeric;
  v_imported int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_affected int;
begin
  if current_app_role() not in ('warehouse_ops', 'recovery_team', 'owner') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_tid := nullif(trim(both from (v_row->>'tid')), '');

    if v_tid is null then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'missing_tid');
      continue;
    end if;

    begin
      v_cod_value := nullif(trim(both from (v_row->>'cod_value')), '')::numeric;
    exception when invalid_text_representation then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'invalid_cod_value');
      continue;
    end;

    insert into parcel_import (tid, granular_status, cod_value, item_description, imported_by)
      values (
        v_tid,
        nullif(trim(both from (v_row->>'granular_status')), ''),
        v_cod_value,
        nullif(trim(both from (v_row->>'item_description')), ''),
        auth.uid()
      )
    on conflict (tid) do update
      set granular_status = excluded.granular_status,
          cod_value = excluded.cod_value,
          item_description = excluded.item_description,
          imported_by = excluded.imported_by,
          imported_at = now()
      where parcel_import.consumed_at is null;

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      v_skipped := v_skipped || jsonb_build_object('row', v_row, 'reason', 'already_consumed');
      continue;
    end if;

    v_imported := v_imported + 1;
  end loop;

  return jsonb_build_object('ok', true, 'imported', v_imported, 'skipped', v_skipped);
end;
$$;

grant execute on function import_parcel_rows(jsonb) to authenticated;
