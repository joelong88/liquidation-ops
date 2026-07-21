-- sack_event/pallet_event mirror stage_event's shape rather than a single polymorphic
-- event log — Postgres can't express a real FK against "whichever table entity_type
-- names", and this codebase has zero triggers today (every invariant lives in the
-- SECURITY INVOKER RPCs). Two tables shaped like stage_event is the smaller departure
-- from the established pattern than a new polymorphic abstraction would be.

create table sack_event (
  event_id    bigserial primary key,
  sack_id     bigint not null references sack(sack_id),
  action      text not null,  -- OPENED | REPACK_OPENED | STRIPPED | HOLD_FORCED
  event_ts    timestamptz not null default now(),
  scanned_by  uuid references auth.users(id),
  station     text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create unique index uq_sack_event_gate
  on sack_event(sack_id, action)
  where action in ('OPENED','STRIPPED');

create index idx_sack_event_sack on sack_event(sack_id);
create index idx_sack_event_action_ts on sack_event(action, event_ts);

create table pallet_event (
  event_id    bigserial primary key,
  pallet_id   bigint not null references pallet(pallet_id),
  action      text not null,  -- SACK_ADDED | TID_ADDED | ENDORSED | SOLD | OUTGOING
  event_ts    timestamptz not null default now(),
  scanned_by  uuid references auth.users(id),
  station     text,
  metadata    jsonb,          -- e.g. {"sack_code": "..."} for SACK_ADDED
  created_at  timestamptz not null default now()
);

create unique index uq_pallet_event_gate
  on pallet_event(pallet_id, action)
  where action in ('ENDORSED','SOLD','OUTGOING');

create index idx_pallet_event_pallet on pallet_event(pallet_id);
create index idx_pallet_event_action_ts on pallet_event(action, event_ts);
