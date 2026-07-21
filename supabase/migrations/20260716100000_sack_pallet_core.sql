-- Phase 2 (see /Users/joelong/.claude/plans/streamed-gathering-mochi.md): sack and
-- pallet as first-class entities. Confirmed with ops via Liquidation Prototype.xlsx —
-- only ONE per-TID scan exists in the whole journey (intake); everything after that
-- (pre-strip, pallet assembly, sale, outbound) happens at sack or pallet granularity.
-- Purely additive: parcel.pallet_code (free text) and all Phase 1 RPCs are untouched.

create table pallet (
  pallet_id     bigserial primary key,
  pallet_code   text not null unique,
  status        text not null default 'ASSEMBLING',  -- ASSEMBLING | ENDORSED | SOLD | OUTGOING
  batch_id      bigint references batch(batch_id),
  assembled_at  timestamptz not null default now(),
  assembled_by  uuid references auth.users(id),
  endorsed_at   timestamptz,
  endorsed_by   uuid references auth.users(id),
  outgoing_at   timestamptz,
  outgoing_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_pallet_status check (status in ('ASSEMBLING','ENDORSED','SOLD','OUTGOING'))
);

comment on column pallet.batch_id is
  'Nullable until sold. A batch can bundle multiple pallets into one sale/recovery-% '
  '(confirmed with Joel — batch and pallet stay distinct concepts, no proportional '
  'per-pallet split). Plain FK, not a join table: a pallet is sold as a whole unit to '
  'one buyer, never split across two batches.';

create index idx_pallet_status on pallet(status);
create index idx_pallet_batch on pallet(batch_id);

create table sack (
  sack_id              bigserial primary key,
  sack_code            text not null,
  area                 text not null,               -- STORAGE | LIQUIDATION
  status               text not null default 'OPEN', -- OPEN | STRIPPED | ON_PALLET
  shipper_segment      text references ref_shipper_segment(code),
  opened_at            timestamptz not null default now(),
  opened_by            uuid references auth.users(id),
  hold_until           timestamptz,
  hold_forced_success  boolean not null default false,
  hold_forced_by       text,
  hold_forced_reason   text,
  hold_forced_at       timestamptz,
  stripped_at          timestamptz,
  stripped_by          uuid references auth.users(id),
  pallet_id            bigint references pallet(pallet_id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint chk_sack_area check (area in ('STORAGE','LIQUIDATION')),
  constraint chk_sack_status check (status in ('OPEN','STRIPPED','ON_PALLET')),
  constraint chk_sack_hold_forced_reason_required check (
    hold_forced_success = false or hold_forced_reason is not null
  )
);

comment on column sack.sack_code is
  'NOT globally unique — physical sack labels get reused across days/areas. Only '
  'unique while status=''OPEN'' (see uq_sack_code_open), mirroring how the old '
  'per-TID force-success/hold logic really meant "one open scan-cycle", not literal '
  'permanent uniqueness of the label.';

comment on column sack.hold_forced_success is
  'Moved from parcel grain (Phase 1) to sack grain: stripping is now a bulk sack-level '
  'scan (Liquidation Prototype.xlsx, "outbound / stripping" = scan of sack ID only, no '
  'per-TID scan), so overriding the hold now necessarily affects every parcel in the '
  'sack at once. Confirmed acceptable with Joel — the per-TID exception case (TikTok '
  'requests one item repacked mid-hold) is a different, already-separate mechanism: '
  'repack_scan pulls that one TID out while the rest of the sack keeps waiting normally.';

create unique index uq_sack_code_open on sack(sack_code) where status = 'OPEN';
create index idx_sack_pallet on sack(pallet_id);
create index idx_sack_hold_until on sack(hold_until) where hold_until is not null;
create index idx_sack_area_status on sack(area, status);

alter table parcel
  add column sack_id   bigint references sack(sack_id),
  add column pallet_id bigint references pallet(pallet_id);

comment on column parcel.sack_id is
  'Denormalized alongside sack.pallet_id/pallet.batch_id — same convention already '
  'used for parcel.cod_value duplicating cod_sync_snapshot, and parcel.batch_id '
  'duplicating what could be derived via sale/batch. Kept in sync transactionally by '
  'the RPCs that write it, source of truth is still sack/pallet themselves.';

create index idx_parcel_sack on parcel(sack_id);
create index idx_parcel_pallet on parcel(pallet_id);
