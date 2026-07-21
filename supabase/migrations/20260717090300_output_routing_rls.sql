-- RLS for M14's output-routing tables, same two-layer rule as every other table in
-- this schema: grant + policy, or silent permission-denied.

grant select on ref_output_bin, ref_config, output_mapping_upload, output_mapping_rule to authenticated;
grant insert, update on ref_config to authenticated;
grant insert on output_mapping_upload, output_mapping_rule to authenticated;

alter table ref_output_bin enable row level security;
alter table ref_config enable row level security;
alter table output_mapping_upload enable row level security;
alter table output_mapping_rule enable row level security;

create policy ref_output_bin_select_all on ref_output_bin for select to authenticated using (true);

create policy ref_config_select_all on ref_config for select to authenticated using (true);
create policy ref_config_update_owner on ref_config for update to authenticated
  using (current_app_role() = 'owner');

create policy output_mapping_upload_select_all on output_mapping_upload for select to authenticated using (true);
create policy output_mapping_upload_insert_owner on output_mapping_upload for insert to authenticated
  with check (current_app_role() = 'owner');

create policy output_mapping_rule_select_all on output_mapping_rule for select to authenticated using (true);
create policy output_mapping_rule_insert_owner on output_mapping_rule for insert to authenticated
  with check (current_app_role() = 'owner');

-- Same class of bug found during M9 browser verification: new bigserial sequences
-- need an explicit grant, the blanket "all sequences" grant only covered what existed
-- when it ran.
grant usage, select on output_mapping_upload_upload_id_seq, output_mapping_rule_rule_id_seq to authenticated;
