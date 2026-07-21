-- M14: output-routing schema, pulled forward from the M11 design since Tab 1 (First
-- Scan) depends on it directly. Bins are now 7 distinct letters A-G (confirmed with
-- Joel — overrides the mapping tab's original A/A/B/B/C/D/E scheme, which shared a
-- letter between the HVI/Non-HVI split within TTXB-storage and within Liquidation area).

create table ref_output_bin (
  code    text primary key,   -- A..G
  label   text not null,
  area    text,                -- STORAGE | LIQUIDATION | null (E/F/G aren't an area)
  is_hvi  boolean not null default false,
  constraint chk_output_bin_area check (area is null or area in ('STORAGE', 'LIQUIDATION'))
);

insert into ref_output_bin (code, label, area, is_hvi) values
  ('A', 'TTXB Storage — HVI',          'STORAGE',     true),
  ('B', 'TTXB Storage — Non-HVI',      'STORAGE',     false),
  ('C', 'Liquidation area — HVI',      'LIQUIDATION', true),
  ('D', 'Liquidation area — Non-HVI',  'LIQUIDATION', false),
  ('E', 'Move to rec area',            null,          false),
  ('F', 'ERROR / ticket creation',     null,          false),
  ('G', 'Repack & return to sort',     null,          false);

comment on column ref_output_bin.code is
  'Bin F is the designated fallback for unmapped Status/Ticket/Outcome combinations
   (resolve_output_bin) — every First Scan resolves here until Joel uploads/enters real
   mapping rules. Expected behavior, not a bug.';

create table ref_config (
  key           text primary key,
  value_numeric numeric,
  value_text    text,
  label         text not null,
  updated_by    uuid references auth.users(id),
  updated_at    timestamptz not null default now()
);

insert into ref_config (key, value_numeric, label)
  values ('hvi_threshold_php', 2000, 'HVI classification threshold (₱)');

comment on table ref_config is
  'Generic key/value config, editable by owner via RLS. Started with the HVI threshold;
   extend with more rows rather than new bespoke tables for future single-value config.';

-- A real daily-upload pipeline (full-replacement snapshots) is deferred — this is the
-- minimal version Joel can use today via a manual add-a-rule action. Single always-active
-- row seeded here; manual-entry rules attach to it.
create table output_mapping_upload (
  upload_id    bigserial primary key,
  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid references auth.users(id),
  source       text not null default 'manual',
  is_active    boolean not null default true
);

insert into output_mapping_upload (source) values ('manual');

create table output_mapping_rule (
  rule_id              bigserial primary key,
  upload_id            bigint not null references output_mapping_upload(upload_id),
  status               text,  -- col F; null = wildcard
  shipper              text,  -- col G
  ticket_type          text,  -- col H
  ticket_subtype       text,  -- col I
  order_outcome        text,  -- col J
  output_bin           text not null references ref_output_bin(code),
  needs_force_success  boolean not null default false,
  created_at           timestamptz not null default now()
);

comment on column output_mapping_rule.needs_force_success is
  'Tab 9''s trigger flag — which parcel statuses need manual force-success is still
   undefined (Joel: "I will define later"). This column exists so that definition only
   requires setting it on the relevant rule rows, no further schema change.';

create index idx_output_mapping_rule_upload on output_mapping_rule(upload_id);
create unique index uq_output_mapping_rule_dedupe on output_mapping_rule(
  upload_id, coalesce(status,''), coalesce(shipper,''),
  coalesce(ticket_type,''), coalesce(ticket_subtype,''), coalesce(order_outcome,'')
);

-- parcel: value capture + output-resolution columns -------------------------------
alter table parcel
  add column granular_status               text,
  add column pets_ticket_subtype            text,
  add column manual_value                   numeric(14,2),
  add column manual_value_item_description  text,
  add column manual_value_entered_by        uuid references auth.users(id),
  add column manual_value_entered_at        timestamptz,
  add column value_source                   text,
  add column effective_value                numeric(14,2) generated always as (coalesce(cod_value, manual_value)) stored,
  add column is_hvi                         boolean,
  add column needs_force_success            boolean not null default false,
  add column resolved_output_bin            text references ref_output_bin(code),
  add column output_resolved_at             timestamptz,
  add constraint chk_parcel_value_source check (value_source is null or value_source in ('COD_SYNC','MANUAL_ESTIMATE'));

comment on column parcel.effective_value is
  'coalesce(cod_value, manual_value) — what the GMV-by-category dashboard (Tab 10) sums
   across every category, not just LIQUIDATION. Generated/stored: forces a one-time table
   rewrite on this migration, fine at current data volume.';

comment on column parcel.is_hvi is
  'Snapshot at value-set time (resolve_output_bin), not live-recomputed if
   ref_config.hvi_threshold_php later changes — already-classified parcels keep their
   original classification.';

create index idx_parcel_needs_force_success on parcel(needs_force_success) where needs_force_success;
