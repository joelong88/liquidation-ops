-- Bin G ("Repack & return to sort") is removed as a valid output-routing
-- destination. The 2 existing SHIPPER ISSUE / POOR PACKAGING mapping rules that
-- pointed here now route to bin E (Move to rec area) instead, same as other
-- manual-handling cases, since there's no dedicated repack-and-return lane anymore.
-- Any already-scanned parcel previously resolved to G (from earlier test scans)
-- gets repointed the same way, since parcel.resolved_output_bin also FKs to this
-- table and would otherwise block the delete below.
update output_mapping_rule set output_bin = 'E' where output_bin = 'G';
update parcel set resolved_output_bin = 'E' where resolved_output_bin = 'G';
delete from ref_output_bin where code = 'G';
