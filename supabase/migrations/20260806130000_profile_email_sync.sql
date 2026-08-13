-- profile carries no email today (only id/role/full_name/is_active) — needed to show
-- who scanned something by their actual login, and to group the new Productivity
-- view by account. Backfill from auth.users directly (source of truth) rather than
-- hardcoding known addresses, and keep it in sync going forward via a trigger —
-- standard Supabase pattern for extending auth.users with a public-schema profile.
alter table profile add column email text;

update profile p set email = u.email from auth.users u where u.id = p.id;

create or replace function sync_profile_email() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profile set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_sync on auth.users;
create trigger on_auth_user_email_sync
  after insert or update of email on auth.users
  for each row execute function sync_profile_email();
