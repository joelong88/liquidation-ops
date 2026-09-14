-- New mapping rule per Joel: PARCEL EXCEPTION / CANCELLED ORDER parcels that are
-- Cancelled should route to the Liquidation area (C/D, split by item value) instead
-- of falling through to the generic PARCEL EXCEPTION -> E catch-all — this rule is
-- more specific (3 matched columns vs. 1) so it correctly outranks that catch-all
-- for this combination without changing it for any other PARCEL EXCEPTION case.
-- Output bin 'C' (not 'D' directly) preserves the existing HVI/non-HVI auto-split by
-- value, matching Joel's own stated logic that the "2999 below value" is part of why
-- this resolves to D, not a hardcoded destination.
insert into output_mapping_rule (upload_id, status, ticket_type, ticket_subtype, output_bin, needs_force_success) values
  (1, 'Cancelled', 'PARCEL EXCEPTION', 'CANCELLED ORDER', 'C', false);
