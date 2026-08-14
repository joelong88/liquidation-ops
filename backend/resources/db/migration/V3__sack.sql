-- sack depends on pallet (nullable — a sack isn't on a pallet until stripped +
-- consolidated) and ref_shipper_segment.
--
-- uq_sack_code_open emulates Postgres's partial unique index
-- `on sack(sack_code) where status = 'OPEN'` (sack codes are reused once closed —
-- only one OPEN sack per code at a time). MySQL has no partial index, but a unique
-- index already treats every NULL as distinct from every other NULL — so a generated
-- column that's NULL whenever status <> 'OPEN' reproduces the exact same semantics.
create table sack (
  sack_id              bigint auto_increment primary key,
  sack_code            varchar(64) not null,
  area                 varchar(20) not null,
  status               varchar(30) not null default 'OPEN',
  shipper_segment      varchar(30),
  opened_at            datetime(6) not null default current_timestamp(6),
  opened_by            varchar(255),
  hold_until           datetime(6),
  hold_forced_success  boolean not null default false,
  hold_forced_by       varchar(255),
  hold_forced_reason   text,
  hold_forced_at       datetime(6),
  stripped_at          datetime(6),
  stripped_by          varchar(255),
  pallet_id            bigint,
  created_at           datetime(6) not null default current_timestamp(6),
  updated_at           datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  sack_code_if_open varchar(64) generated always as (
    case when status = 'OPEN' then sack_code else null end
  ) stored,
  constraint fk_sack_pallet foreign key (pallet_id) references pallet(pallet_id),
  constraint fk_sack_shipper_segment foreign key (shipper_segment) references ref_shipper_segment(code),
  constraint chk_sack_area check (area in ('STORAGE','LIQUIDATION')),
  constraint chk_sack_status check (status in ('OPEN','CLOSED','STRIPPED','ON_PALLET')),
  constraint chk_sack_hold_forced_reason_required check (
    hold_forced_success = false or hold_forced_reason is not null
  ),
  unique key uq_sack_code_open (sack_code_if_open),
  key idx_sack_hold_until (hold_until),
  key idx_sack_pallet (pallet_id)
) engine=InnoDB default charset=utf8mb4;
