-- Reference/config tables: no FK dependencies, seeded directly (see V5).
-- text PK/FK/indexed columns become VARCHAR (MySQL can't index/PK a bare TEXT column
-- without a prefix length); free-text description columns stay TEXT.

create table ref_shipper_segment (
  code       varchar(30) primary key,
  label      varchar(100) not null,
  hold_days  int not null default 0,
  is_active  boolean not null default true
) engine=InnoDB default charset=utf8mb4;

create table ref_stage (
  code                 varchar(30) primary key,
  seq_order            int not null,
  label                varchar(100) not null,
  requires_hold_check  boolean not null default false,
  is_active            boolean not null default true,
  unique key uq_ref_stage_seq_order (seq_order)
) engine=InnoDB default charset=utf8mb4;

create table ref_parcel_category (
  code                  varchar(30) primary key,
  label                 varchar(100) not null,
  for_liquidation       boolean not null,
  next_action           text,
  outgoing_status_map   varchar(255)
) engine=InnoDB default charset=utf8mb4;

create table ref_item_type (
  code   varchar(30) primary key,
  label  varchar(100) not null
) engine=InnoDB default charset=utf8mb4;

create table ref_output_bin (
  code    varchar(10) primary key,
  label   varchar(100) not null,
  area    varchar(20),
  is_hvi  boolean not null default false,
  constraint chk_output_bin_area check (area is null or area in ('STORAGE', 'LIQUIDATION'))
) engine=InnoDB default charset=utf8mb4;

create table ref_config (
  `key`          varchar(64) primary key,
  value_numeric  decimal(14,2),
  value_text     varchar(255),
  label          varchar(255) not null,
  updated_by     varchar(255),
  updated_at     datetime(6) not null default current_timestamp(6)
) engine=InnoDB default charset=utf8mb4;
