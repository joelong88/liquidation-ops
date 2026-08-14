-- parcel depends on ref_shipper_segment/ref_parcel_category/ref_item_type/ref_stage/
-- ref_output_bin/batch/sack/pallet — the last table in the core dependency chain.
-- stage_event/sack_event/pallet_event are append-only logs, one per grain.
--
-- effective_value mirrors the Postgres generated column exactly (GMV hierarchy:
-- goods_value, else greatest(cod_value, insurance_value), else xb_value_usd * 61.45
-- fixed rate, else manual_value) — COALESCE/GREATEST/CASE all exist in MySQL 8.

create table parcel (
  tid                            varchar(30) primary key,
  is_synthetic_tid               boolean not null default false,
  order_id                       varchar(255),
  shipper_segment                varchar(30) not null default 'UNKNOWN',
  parcel_category                varchar(30),
  item_type                      varchar(30) default 'STANDARD',
  pallet_code                    varchar(64),
  cod_value                      decimal(14,2),
  cod_synced_at                  datetime(6),
  cod_source                     varchar(50),
  pets_ticket_type               varchar(100),
  pets_ticket_outcome            varchar(255),
  pets_resolved                  boolean,
  current_stage                  varchar(30) not null default 'RECEIVED',
  received_at                    datetime(6),
  hold_until                     datetime(6),
  hold_forced_success            boolean not null default false,
  hold_forced_by                 varchar(255),
  hold_forced_reason             text,
  hold_forced_at                 datetime(6),
  batch_id                       bigint,
  created_at                     datetime(6) not null default current_timestamp(6),
  updated_at                     datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  sack_id                        bigint,
  pallet_id                      bigint,
  granular_status                varchar(100),
  pets_ticket_subtype            varchar(100),
  manual_value                   decimal(14,2),
  manual_value_item_description  text,
  manual_value_entered_by        varchar(255),
  manual_value_entered_at        datetime(6),
  value_source                   varchar(30),
  is_hvi                         boolean,
  needs_force_success            boolean not null default false,
  resolved_output_bin            varchar(10),
  output_resolved_at             datetime(6),
  goods_value                    decimal(14,2),
  insurance_value                decimal(14,2),
  xb_value_usd                   decimal(14,2),
  effective_value decimal(14,2) generated always as (
    case
      when coalesce(goods_value, 0) <> 0 then goods_value
      when greatest(coalesce(cod_value, 0), coalesce(insurance_value, 0)) <> 0
        then greatest(coalesce(cod_value, 0), coalesce(insurance_value, 0))
      when coalesce(xb_value_usd, 0) <> 0 then xb_value_usd * 61.45
      else manual_value
    end
  ) stored,
  constraint fk_parcel_shipper_segment foreign key (shipper_segment) references ref_shipper_segment(code),
  constraint fk_parcel_category foreign key (parcel_category) references ref_parcel_category(code),
  constraint fk_parcel_item_type foreign key (item_type) references ref_item_type(code),
  constraint fk_parcel_stage foreign key (current_stage) references ref_stage(code),
  constraint fk_parcel_batch foreign key (batch_id) references batch(batch_id),
  constraint fk_parcel_sack foreign key (sack_id) references sack(sack_id),
  constraint fk_parcel_pallet foreign key (pallet_id) references pallet(pallet_id),
  constraint fk_parcel_output_bin foreign key (resolved_output_bin) references ref_output_bin(code),
  constraint chk_hold_forced_reason_required check (
    hold_forced_success = false or hold_forced_reason is not null
  ),
  constraint chk_parcel_value_source check (
    value_source is null or value_source in ('COD_SYNC','MANUAL_ESTIMATE','CSV_IMPORT')
  ),
  constraint chk_tid_length check (length(tid) <= 30),
  key idx_parcel_hold_until (hold_until),
  key idx_parcel_needs_force_success (needs_force_success),
  key idx_parcel_cod_value (cod_value)
) engine=InnoDB default charset=utf8mb4;

-- uq_stage_event_gate/uq_sack_event_gate/uq_pallet_event_gate all emulate a Postgres
-- partial unique index the same way as uq_sack_code_open above: a generated column
-- that's NULL outside the gated set, so a unique index over it only enforces
-- "at most one" among the gated actions/stages, and freely allows any number of
-- other (non-gated) rows for the same (tid, stage) / (sack_id, action) pair.

create table stage_event (
  event_id    bigint auto_increment primary key,
  tid         varchar(30) not null,
  stage       varchar(30) not null,
  event_ts    datetime(6) not null default current_timestamp(6),
  scanned_by  varchar(255),
  station     varchar(100),
  metadata    json,
  created_at  datetime(6) not null default current_timestamp(6),
  gated_stage varchar(30) generated always as (
    case when stage in ('RECEIVED','STAMPED','IN_STORAGE','ENDORSED','OUTGOING') then stage else null end
  ) stored,
  constraint fk_stage_event_parcel foreign key (tid) references parcel(tid),
  constraint fk_stage_event_stage foreign key (stage) references ref_stage(code),
  unique key uq_stage_event_gate (tid, gated_stage),
  key idx_stage_event_stage_ts (stage, event_ts)
) engine=InnoDB default charset=utf8mb4;

create table sack_event (
  event_id     bigint auto_increment primary key,
  sack_id      bigint not null,
  action       varchar(30) not null,
  event_ts     datetime(6) not null default current_timestamp(6),
  scanned_by   varchar(255),
  station      varchar(100),
  metadata     json,
  created_at   datetime(6) not null default current_timestamp(6),
  gated_action varchar(30) generated always as (
    case when action in ('OPENED','CLOSED','STRIPPED') then action else null end
  ) stored,
  constraint fk_sack_event_sack foreign key (sack_id) references sack(sack_id),
  unique key uq_sack_event_gate (sack_id, gated_action)
) engine=InnoDB default charset=utf8mb4;

create table pallet_event (
  event_id     bigint auto_increment primary key,
  pallet_id    bigint not null,
  action       varchar(30) not null,
  event_ts     datetime(6) not null default current_timestamp(6),
  scanned_by   varchar(255),
  station      varchar(100),
  metadata     json,
  created_at   datetime(6) not null default current_timestamp(6),
  gated_action varchar(30) generated always as (
    case when action in ('CLOSED','ENDORSED','SOLD','OUTGOING') then action else null end
  ) stored,
  constraint fk_pallet_event_pallet foreign key (pallet_id) references pallet(pallet_id),
  unique key uq_pallet_event_gate (pallet_id, gated_action)
) engine=InnoDB default charset=utf8mb4;
