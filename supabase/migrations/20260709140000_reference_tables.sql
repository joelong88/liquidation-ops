-- Reference/config tables. Hold duration and status/category mappings are data,
-- not code, so operational reality (see Open Risk #1 in the Phase 1 plan) can be
-- corrected without a code change.

create table ref_shipper_segment (
  code       text primary key,
  label      text not null,
  hold_days  int  not null default 0,
  is_active  boolean not null default true
);

comment on column ref_shipper_segment.hold_days is
  'Days a parcel must sit in IN_STORAGE before ENDORSED is allowed for this segment. '
  'TTXB confirmed at 7 days (not the originally-stated 30) — matches the majority '
  '(90%) of real Maturity Date gaps observed in the live "2.2 TTDI Storage" sheet. '
  'A residual ~10% of historical rows show an 11-day gap instead of 7; not yet '
  'explained (possibly a weekend/holiday push-out) but not blocking, since it is a '
  'minority pattern and the config is adjustable without a code change either way.';

create table ref_stage (
  code                 text primary key,
  seq_order            int  not null unique,
  label                text not null,
  requires_hold_check  boolean not null default false
);

create table ref_parcel_category (
  code                 text primary key,
  label                text not null,
  for_liquidation      boolean not null,
  next_action          text,
  outgoing_status_map  text
);

comment on table ref_parcel_category is
  'Mirrors the "Status Mapping" sheet. Several legacy statuses collapse into one '
  'category with more than one Next Action nuance (e.g. INVESTIGATION covers both '
  '"partial damage -> repack" and "total damage -> disposal"); Phase 1 treats Next '
  'Action as informational text only, not a modeled sub-case, per the Phase 1 plan.';

create table ref_item_type (
  code   text primary key,
  label  text not null
);
