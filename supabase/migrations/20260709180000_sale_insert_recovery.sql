-- Fixes a mismatch found while building M5: the Phase 1 plan has recovery_team
-- recording the winning bid as a pending sale (payment_status defaults to PENDING,
-- no payment_date yet), with finance_team only updating it once payment clears. The
-- original RLS only granted INSERT on `sale` to finance_team/owner, which would have
-- blocked recovery_team from doing the thing the plan says they do.
drop policy sale_insert_finance on sale;

create policy sale_insert_recovery_or_finance on sale for insert to authenticated
  with check (current_app_role() in ('recovery_team', 'finance_team', 'owner'));
