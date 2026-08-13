-- Mirrors the sack CLOSED lifecycle (20260718100000) one level up: an explicit CLOSED
-- state between ASSEMBLING (accepting sacks) and ENDORSED, so an operator can seal a
-- pallet once it has ~10 sacks on it and move on to a new pallet code — combining
-- Tab 4 (Strip TTXB Storage) with Consolidate-onto-Pallet needs this the same way
-- combining First Scan + Storage-inbound needed close_sack for the "current sack" box.
alter table pallet drop constraint chk_pallet_status;
alter table pallet add constraint chk_pallet_status check (status in ('ASSEMBLING', 'CLOSED', 'ENDORSED', 'SOLD', 'OUTGOING'));

drop index uq_pallet_event_gate;
create unique index uq_pallet_event_gate
  on pallet_event(pallet_id, action)
  where action in ('CLOSED', 'ENDORSED', 'SOLD', 'OUTGOING');

create or replace function close_pallet(
  p_pallet_code text,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pallet pallet%rowtype;
begin
  select * into v_pallet from pallet where pallet_code = p_pallet_code and status = 'ASSEMBLING' for update;

  if v_pallet.pallet_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  begin
    insert into pallet_event (pallet_id, action, scanned_by, station)
      values (v_pallet.pallet_id, 'CLOSED', auth.uid(), p_station);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_closed');
  end;

  update pallet set status = 'CLOSED', updated_at = now() where pallet_id = v_pallet.pallet_id;

  return jsonb_build_object('ok', true, 'pallet_id', v_pallet.pallet_id, 'pallet_code', p_pallet_code);
end;
$$;

comment on function close_pallet is
  'Seals a pallet (no more sack additions — assign_pallet already rejects anything
   other than ASSEMBLING) so the operator can move on to a new pallet code. Does not
   endorse it — that stays a separate, weekly, bulk action.';

grant execute on function close_pallet(text, text) to authenticated;

-- Endorsement now accepts a CLOSED pallet (the expected path once Tab 4 combines
-- strip+consolidate) as well as ASSEMBLING (an old or never-explicitly-closed pallet
-- shouldn't become un-endorsable just because this column is new).
create or replace function endorse_pallets_to_admin(
  p_pallet_ids bigint[]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pallet_id bigint;
  v_pallet pallet%rowtype;
  v_endorsed bigint[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
begin
  foreach v_pallet_id in array p_pallet_ids loop
    select * into v_pallet from pallet where pallet_id = v_pallet_id for update;

    if v_pallet.pallet_id is null then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_found');
      continue;
    end if;
    if v_pallet.status not in ('ASSEMBLING', 'CLOSED') then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'not_assembling');
      continue;
    end if;

    begin
      insert into pallet_event (pallet_id, action, scanned_by)
        values (v_pallet.pallet_id, 'ENDORSED', auth.uid());
    exception when unique_violation then
      v_skipped := v_skipped || jsonb_build_object('pallet_id', v_pallet_id, 'reason', 'already_endorsed');
      continue;
    end;

    update pallet
      set status = 'ENDORSED', endorsed_at = now(), endorsed_by = auth.uid(), updated_at = now()
      where pallet_id = v_pallet.pallet_id;

    update parcel set current_stage = 'ENDORSED', updated_at = now()
      where pallet_id = v_pallet.pallet_id;

    v_endorsed := v_endorsed || v_pallet_id;
  end loop;

  return jsonb_build_object('ok', true, 'endorsed', to_jsonb(v_endorsed), 'skipped', v_skipped);
end;
$$;
