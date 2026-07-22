-- Introduces an explicit CLOSED state between OPEN (accepting scans) and STRIPPED:
-- operators need a way to seal a sack once it's full, before stripping, so a new
-- sack code can be used for subsequent scans. Requested for the TTXB-storage inbound
-- station, but applied uniformly — strip_sack now requires CLOSED for BOTH areas, so
-- the Liquidation-area strip station needs the same closing capability or it would
-- never have anything to strip.

alter table sack drop constraint chk_sack_status;
alter table sack add constraint chk_sack_status check (status in ('OPEN', 'CLOSED', 'STRIPPED', 'ON_PALLET'));

drop index uq_sack_event_gate;
create unique index uq_sack_event_gate on sack_event(sack_id, action) where action in ('OPENED', 'CLOSED', 'STRIPPED');

create or replace function close_sack(
  p_sack_code text,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sack sack%rowtype;
begin
  select * into v_sack from sack where sack_code = p_sack_code and status = 'OPEN' for update;

  if v_sack.sack_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  begin
    insert into sack_event (sack_id, action, scanned_by, station)
      values (v_sack.sack_id, 'CLOSED', auth.uid(), p_station);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_closed');
  end;

  update sack set status = 'CLOSED', updated_at = now() where sack_id = v_sack.sack_id;

  return jsonb_build_object('ok', true, 'sack_id', v_sack.sack_id, 'sack_code', p_sack_code, 'area', v_sack.area);
end;
$$;

comment on function close_sack is
  'Seals a sack (no more TID additions) so the operator can move on to a new sack
   code. Does not strip it — strip_sack now requires CLOSED, not OPEN.';

grant execute on function close_sack(text, text) to authenticated;


-- Now requires CLOSED (not OPEN) — an explicit close is a prerequisite for stripping.
-- Also fixes a real bug: the original version only bulk-advanced parcels from
-- RECEIVED/IN_STORAGE, missing IN_LIQUIDATION_AREA (added after this function was
-- first written) — so stripping a Liquidation-area sack never actually advanced its
-- non-TTXB member parcels' current_stage.
create or replace function strip_sack(
  p_sack_code text,
  p_area text,
  p_station text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sack sack%rowtype;
  v_advanced int;
begin
  select * into v_sack from sack
    where sack_code = p_sack_code and area = p_area and status in ('OPEN', 'CLOSED', 'STRIPPED')
    order by created_at desc
    limit 1
    for update;

  if v_sack.sack_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_sack.status = 'OPEN' then
    return jsonb_build_object('ok', false, 'error', 'not_closed');
  end if;
  if v_sack.status = 'STRIPPED' then
    return jsonb_build_object('ok', false, 'error', 'already_stripped');
  end if;

  if p_area = 'STORAGE'
     and v_sack.hold_until is not null
     and v_sack.hold_until > now()
     and not v_sack.hold_forced_success then
    return jsonb_build_object('ok', false, 'error', 'hold_not_matured', 'hold_until', v_sack.hold_until);
  end if;

  insert into sack_event (sack_id, action, scanned_by, station)
    values (v_sack.sack_id, 'STRIPPED', auth.uid(), p_station);

  update sack
    set status = 'STRIPPED', stripped_at = now(), stripped_by = auth.uid(), updated_at = now()
    where sack_id = v_sack.sack_id;

  update parcel
    set current_stage = 'STRIPPED', updated_at = now()
    where sack_id = v_sack.sack_id
      and current_stage in ('RECEIVED', 'IN_STORAGE', 'IN_LIQUIDATION_AREA');
  get diagnostics v_advanced = row_count;

  return jsonb_build_object('ok', true, 'sack_id', v_sack.sack_id, 'parcels_advanced', v_advanced);
end;
$$;


-- Force-success now applies to a CLOSED sack awaiting stripping, not an OPEN one
-- still being filled.
create or replace function force_sack_hold_success(
  p_sack_code text,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sack sack%rowtype;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select * into v_sack from sack
    where sack_code = p_sack_code and status = 'CLOSED' and area = 'STORAGE'
    for update;

  if v_sack.sack_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update sack
    set hold_forced_success = true,
        hold_forced_by = auth.uid()::text,
        hold_forced_reason = p_reason,
        hold_forced_at = now(),
        updated_at = now()
    where sack_id = v_sack.sack_id;

  insert into sack_event (sack_id, action, scanned_by, metadata)
    values (v_sack.sack_id, 'HOLD_FORCED', auth.uid(), jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'sack_id', v_sack.sack_id);
end;
$$;
