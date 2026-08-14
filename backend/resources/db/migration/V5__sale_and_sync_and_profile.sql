-- sale depends on batch + parcel. expected_arrival depends on parcel.
-- cod_sync_snapshot/sync_run are standalone audit/observability tables.
--
-- uq_sale_one_per_batch needs NO generated-column trick, unlike the four gate
-- indexes above — MySQL unique indexes already treat every NULL as distinct from
-- every other NULL, which is exactly the Postgres partial-index behavior
-- (`where batch_id is not null`) for free on a plain nullable unique column.

create table sale (
  sale_id         bigint auto_increment primary key,
  batch_id        bigint,
  tid             varchar(30),
  channel         varchar(30) not null default 'EXTERNAL_AUCTION',
  buyer_name      varchar(255),
  buyer_id        varchar(255),
  sale_amount     decimal(14,2) not null,
  payment_date    date,
  payment_status  varchar(30) not null default 'PENDING',
  created_by      varchar(255),
  created_at      datetime(6) not null default current_timestamp(6),
  sale_date       date not null default (curdate()),
  constraint fk_sale_batch foreign key (batch_id) references batch(batch_id),
  constraint fk_sale_parcel foreign key (tid) references parcel(tid),
  constraint chk_sale_channel check (channel in ('EXTERNAL_AUCTION','EMPLOYEE_AUCTION')),
  constraint chk_sale_payment_status check (payment_status in ('PENDING','PAID','PARTIAL')),
  constraint chk_sale_exactly_one_target check (
    (batch_id is not null and tid is null) or (batch_id is null and tid is not null)
  ),
  unique key uq_sale_one_per_batch (batch_id),
  key idx_sale_payment_status (payment_status)
) engine=InnoDB default charset=utf8mb4;

create table expected_arrival (
  id              bigint auto_increment primary key,
  tid             varchar(30) not null,
  source_system   varchar(30) not null default 'PETS',
  pets_ticket_id  varchar(100),
  pets_reason     varchar(100),
  synced_at       datetime(6) not null default current_timestamp(6),
  raw_payload     json,
  pets_ticket_id_norm varchar(100) generated always as (coalesce(pets_ticket_id, '')) stored,
  constraint fk_expected_arrival_parcel foreign key (tid) references parcel(tid),
  unique key uq_expected_arrival_tid_ticket (tid, pets_ticket_id_norm)
) engine=InnoDB default charset=utf8mb4;

create table cod_sync_snapshot (
  id                  bigint auto_increment primary key,
  tid                 varchar(30) not null,
  order_id            varchar(255),
  cod_amount          decimal(14,2),
  granular_status     varchar(100),
  shipper_name        varchar(255),
  global_shipper_id   varchar(100),
  item_description    text,
  is_phone_case       boolean,
  synced_at           datetime(6) not null default current_timestamp(6),
  raw_payload         json,
  key idx_cod_snapshot_tid_ts (tid, synced_at)
) engine=InnoDB default charset=utf8mb4;

create table sync_run (
  id                bigint auto_increment primary key,
  job_name          varchar(100) not null,
  started_at        datetime(6) not null default current_timestamp(6),
  completed_at      datetime(6),
  status            varchar(30) not null default 'running',
  records_seen      int default 0,
  records_upserted  int default 0,
  error_detail      text,
  triggered_by      varchar(30) default 'cron',
  constraint chk_sync_run_status check (status in ('running','success','partial','failed')),
  constraint chk_sync_run_triggered_by check (triggered_by in ('cron','manual')),
  key idx_sync_run_job_started (job_name, started_at)
) engine=InnoDB default charset=utf8mb4;

-- profile.id was `uuid references auth.users(id)` under Supabase Auth — there's no
-- equivalent identity table here, and the Phase C auth swap looks users up by their
-- SSO-forwarded email instead of a Supabase user id, so email becomes the primary
-- key directly rather than carrying over a now-meaningless uuid column.
create table profile (
  email      varchar(255) primary key,
  role       varchar(30) not null,
  full_name  varchar(255),
  is_active  boolean not null default true,
  constraint chk_profile_role check (role in ('warehouse_ops','recovery_team','finance_team','owner'))
) engine=InnoDB default charset=utf8mb4;
