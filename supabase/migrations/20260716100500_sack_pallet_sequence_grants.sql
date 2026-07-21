-- Fix found during M9 browser verification: `grant usage, select on all sequences in
-- schema public to authenticated` (20260709140200_rls_policies.sql) only covers
-- sequences that existed when that GRANT ran — it does not retroactively cover
-- sequences created by later migrations. The Phase 2 sack/pallet/event bigserial
-- columns each created a new sequence that authenticated users had no access to,
-- causing "permission denied for sequence sack_sack_id_seq" on the first live
-- record_intake_scan call. Grant them explicitly, same as the original comment
-- warns: every new bigserial table needs this or inserts fail with a GRANT gap.
grant usage, select on
  sack_sack_id_seq,
  pallet_pallet_id_seq,
  sack_event_event_id_seq,
  pallet_event_event_id_seq
to authenticated;
