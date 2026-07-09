-- Core pipeline tables: parcel, stage_event, expected_arrival, sync tables, batch, sale, profile.
-- See /Users/joelong/.claude/plans/streamed-gathering-mochi.md for the design rationale
-- behind each constraint below (each maps to a concrete problem found in the source sheets).

create table batch (
  batch_id       bigserial primary key,
  batch_number   int not null unique,
  batch_type     text not null default 'STANDARD',        -- STANDARD | PHONE_CASE | NO_AWB
  channel        text not null default 'EXTERNAL_AUCTION', -- EXTERNAL_AUCTION | EMPLOYEE_AUCTION (Phase 2)
  month          date,
  status         text not null default 'OPEN',             -- OPEN | PRICED | SOLD | CLOSED
  ceiling_price  numeric(14,2),
  floor_price    numeric(14,2),
  priced_at      timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_batch_type check (batch_type in ('STANDARD','PHONE_CASE','NO_AWB')),
  constraint chk_batch_channel check (channel in ('EXTERNAL_AUCTION','EMPLOYEE_AUCTION')),
  constraint chk_batch_status check (status in ('OPEN','PRICED','SOLD','CLOSED')),
  constraint chk_floor_half_ceiling check (
    floor_price is null or ceiling_price is null or floor_price = round(ceiling_price / 2, 2)
  )
);

create sequence noawb_seq;

create table parcel (
  tid                  text primary key,
  is_synthetic_tid     boolean not null default false,
  order_id             text,
  shipper_segment      text not null references ref_shipper_segment(code) default 'UNKNOWN',
  parcel_category      text references ref_parcel_category(code),
  item_type            text references ref_item_type(code) default 'STANDARD',
  pallet_code          text,

  cod_value            numeric(14,2),
  cod_synced_at        timestamptz,
  cod_source           text,  -- redash_sync | manual_no_awb

  pets_ticket_type     text,
  pets_ticket_outcome  text,
  pets_resolved        boolean,

  current_stage        text not null references ref_stage(code) default 'RECEIVED',
  received_at          timestamptz,
  hold_until           timestamptz,
  hold_forced_success  boolean not null default false,
  hold_forced_by       text,
  hold_forced_reason   text,
  hold_forced_at       timestamptz,

  batch_id             bigint references batch(batch_id),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint chk_hold_forced_reason_required check (
    hold_forced_success = false or hold_forced_reason is not null
  )
);

create index idx_parcel_stage on parcel(current_stage);
create index idx_parcel_segment on parcel(shipper_segment);
create index idx_parcel_hold_until on parcel(hold_until) where hold_until is not null;
create index idx_parcel_batch on parcel(batch_id);
create index idx_parcel_cod_null on parcel(tid) where cod_value is null;

create table stage_event (
  event_id    bigserial primary key,
  tid         text not null references parcel(tid),
  stage       text not null references ref_stage(code),
  event_ts    timestamptz not null default now(),
  scanned_by  uuid references auth.users(id),
  station     text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create unique index uq_stage_event_gate
  on stage_event(tid, stage)
  where stage in ('RECEIVED','STAMPED','IN_STORAGE','ENDORSED','OUTGOING');

create index idx_stage_event_tid on stage_event(tid);
create index idx_stage_event_stage_ts on stage_event(stage, event_ts);

create table expected_arrival (
  id              bigserial primary key,
  tid             text not null references parcel(tid),
  source_system   text not null default 'PETS',
  pets_ticket_id  text,
  pets_reason     text,  -- LOST | SLA BREACH
  synced_at       timestamptz not null default now(),
  raw_payload     jsonb
);

create unique index uq_expected_arrival_tid_ticket
  on expected_arrival(tid, coalesce(pets_ticket_id, ''));
create index idx_expected_arrival_tid on expected_arrival(tid);

create table cod_sync_snapshot (
  id                 bigserial primary key,
  tid                text not null,
  order_id           text,
  cod_amount         numeric(14,2),
  granular_status    text,
  shipper_name       text,
  global_shipper_id  text,
  item_description   text,
  is_phone_case      boolean,
  synced_at          timestamptz not null default now(),
  raw_payload        jsonb
);

create index idx_cod_snapshot_tid_ts on cod_sync_snapshot(tid, synced_at desc);

create table sync_run (
  id                bigserial primary key,
  job_name          text not null,  -- pets_sync | redash_cod_sync
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  status            text not null default 'running',  -- running | success | partial | failed
  records_seen      int default 0,
  records_upserted  int default 0,
  error_detail      text,
  triggered_by      text default 'cron',  -- cron | manual
  constraint chk_sync_run_status check (status in ('running','success','partial','failed')),
  constraint chk_sync_run_triggered_by check (triggered_by in ('cron','manual'))
);

create index idx_sync_run_job_started on sync_run(job_name, started_at desc);

create table sale (
  sale_id         bigserial primary key,
  batch_id        bigint references batch(batch_id),
  tid             text references parcel(tid),
  channel         text not null default 'EXTERNAL_AUCTION',
  buyer_name      text,
  buyer_id        uuid,  -- reserved for Phase 2 buyer table
  sale_amount     numeric(14,2) not null,
  payment_date    date,
  payment_status  text not null default 'PENDING',  -- PENDING | PAID | PARTIAL
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  constraint chk_sale_channel check (channel in ('EXTERNAL_AUCTION','EMPLOYEE_AUCTION')),
  constraint chk_sale_payment_status check (payment_status in ('PENDING','PAID','PARTIAL')),
  constraint chk_sale_exactly_one_target check (
    (batch_id is not null and tid is null) or (batch_id is null and tid is not null)
  )
);

comment on constraint chk_sale_channel on sale is
  'EMPLOYEE_AUCTION 40%-of-GMV price floor is enforced by a Phase 2 trigger, not yet '
  'built in Phase 1 — see the "Employee-auction 40%-of-GMV floor" note in the Phase 1 plan.';

create unique index uq_sale_one_per_batch on sale(batch_id) where batch_id is not null;
create index idx_sale_payment_status on sale(payment_status);

create table profile (
  id         uuid primary key references auth.users(id),
  role       text not null,
  full_name  text,
  is_active  boolean not null default true,
  constraint chk_profile_role check (role in ('warehouse_ops','recovery_team','finance_team','owner'))
);
