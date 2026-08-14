-- output_mapping_rule depends on output_mapping_upload + ref_output_bin.
-- parcel_import/csv_upload_log are standalone staging/observability tables.
--
-- uq_output_mapping_rule_dedupe: the Postgres original is a 6-column expression
-- index using coalesce() on 5 nullable columns so two wildcard (null) rules for the
-- same upload don't count as "different" just because Postgres treats NULL <> NULL.
-- CONCAT_WS with a control-character delimiter (0x01, never present in real ticket-
-- type/shipper/outcome text) reproduces the same dedupe key as a single generated
-- column MySQL can put a unique index on.
create table output_mapping_upload (
  upload_id    bigint auto_increment primary key,
  uploaded_at  datetime(6) not null default current_timestamp(6),
  uploaded_by  varchar(255),
  source       varchar(30) not null default 'manual',
  is_active    boolean not null default true
) engine=InnoDB default charset=utf8mb4;

create table output_mapping_rule (
  rule_id               bigint auto_increment primary key,
  upload_id             bigint not null,
  status                varchar(100),
  shipper               varchar(100),
  ticket_type           varchar(100),
  ticket_subtype        varchar(100),
  order_outcome         varchar(255),
  output_bin            varchar(10) not null,
  needs_force_success   boolean not null default false,
  created_at            datetime(6) not null default current_timestamp(6),
  dedupe_key varchar(700) generated always as (
    concat_ws(char(1), upload_id,
      coalesce(status, ''), coalesce(shipper, ''),
      coalesce(ticket_type, ''), coalesce(ticket_subtype, ''), coalesce(order_outcome, '')
    )
  ) stored,
  constraint fk_output_mapping_rule_upload foreign key (upload_id) references output_mapping_upload(upload_id),
  constraint fk_output_mapping_rule_bin foreign key (output_bin) references ref_output_bin(code),
  unique key uq_output_mapping_rule_dedupe (dedupe_key)
) engine=InnoDB default charset=utf8mb4;

create table parcel_import (
  tid                   varchar(30) primary key,
  granular_status       varchar(100),
  cod_value             decimal(14,2),
  item_description      text,
  imported_by           varchar(255),
  imported_at           datetime(6) not null default current_timestamp(6),
  consumed_at           datetime(6),
  goods_value           decimal(14,2),
  insurance_value       decimal(14,2),
  xb_value_usd          decimal(14,2),
  pets_ticket_type      varchar(100),
  pets_ticket_subtype   varchar(100),
  pets_ticket_outcome   varchar(255),
  shipper_segment_raw   varchar(100),
  constraint chk_parcel_import_tid_length check (length(tid) <= 30),
  key idx_parcel_import_pending (consumed_at, imported_at)
) engine=InnoDB default charset=utf8mb4;

create table csv_upload_log (
  upload_id        bigint auto_increment primary key,
  uploaded_at      datetime(6) not null default current_timestamp(6),
  uploaded_by      varchar(255),
  total_rows       int not null default 0,
  imported_count   int not null default 0,
  skipped_count    int not null default 0,
  ttxb_count       int not null default 0,
  non_ttxb_count   int not null default 0
) engine=InnoDB default charset=utf8mb4;
