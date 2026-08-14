-- batch has no FK deps; pallet depends on batch (nullable — a pallet starts
-- ASSEMBLING with no batch, gets one assigned at sale time).
-- Actor/"*_by" columns were `uuid references auth.users(id)` under Supabase Auth —
-- there is no equivalent auth table here, so they become plain nullable email
-- strings (VARCHAR), populated by the app once the Phase C auth swap lands.

create table batch (
  batch_id       bigint auto_increment primary key,
  batch_number   int not null,
  batch_type     varchar(30) not null default 'STANDARD',
  channel        varchar(30) not null default 'EXTERNAL_AUCTION',
  month          date,
  status         varchar(30) not null default 'OPEN',
  ceiling_price  decimal(14,2),
  floor_price    decimal(14,2),
  priced_at      datetime(6),
  created_by     varchar(255),
  created_at     datetime(6) not null default current_timestamp(6),
  updated_at     datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  unique key uq_batch_number (batch_number),
  constraint chk_batch_type check (batch_type in ('STANDARD','PHONE_CASE','NO_AWB')),
  constraint chk_batch_channel check (channel in ('EXTERNAL_AUCTION','EMPLOYEE_AUCTION')),
  constraint chk_batch_status check (status in ('OPEN','PRICED','SOLD','CLOSED')),
  constraint chk_floor_half_ceiling check (
    floor_price is null or ceiling_price is null or floor_price = round(ceiling_price / 2, 2)
  )
) engine=InnoDB default charset=utf8mb4;

-- Replaces Postgres's `nextval('noawb_seq')` (MySQL 8/OceanBase has no CREATE
-- SEQUENCE) — app code does `insert into noawb_seq values (); select
-- last_insert_id();` to mint the next number for a NOAWB-000123-style synthetic TID.
create table noawb_seq (
  id bigint auto_increment primary key
) engine=InnoDB default charset=utf8mb4;

create table pallet (
  pallet_id     bigint auto_increment primary key,
  pallet_code   varchar(64) not null,
  status        varchar(30) not null default 'ASSEMBLING',
  batch_id      bigint,
  assembled_at  datetime(6) not null default current_timestamp(6),
  assembled_by  varchar(255),
  endorsed_at   datetime(6),
  endorsed_by   varchar(255),
  outgoing_at   datetime(6),
  outgoing_by   varchar(255),
  created_at    datetime(6) not null default current_timestamp(6),
  updated_at    datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  unique key uq_pallet_code (pallet_code),
  constraint fk_pallet_batch foreign key (batch_id) references batch(batch_id),
  constraint chk_pallet_status check (status in ('ASSEMBLING','CLOSED','ENDORSED','SOLD','OUTGOING'))
) engine=InnoDB default charset=utf8mb4;
