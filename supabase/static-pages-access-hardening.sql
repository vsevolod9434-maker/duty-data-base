-- Static GitHub Pages access hardening.
-- This file intentionally protects only the access/control tables used by the
-- browser auth gate and the duty-members UI. Operational table policies remain
-- a separate concern and should be audited independently.

create or replace function public.current_access_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select access_user.role::text
  from public."AccessUser" as access_user
  where access_user."authUserId" = auth.uid()
    and access_user."isActive" = true
  limit 1
$$;

create or replace function public.is_active_access_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public."AccessUser" as access_user
    where access_user."authUserId" = auth.uid()
      and access_user."isActive" = true
  )
$$;

create or replace function public.resolve_access_user_auth_email(lookup_identifier text)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with normalized_input as (
    select nullif(regexp_replace(lower(btrim(lookup_identifier)), '\s+', ' ', 'g'), '') as value
  )
  select access_user."authEmail"
  from public."AccessUser" as access_user
  cross join normalized_input
  where normalized_input.value is not null
    and access_user."isActive" = true
    and (
      lower(access_user."authEmail") = normalized_input.value
      or access_user."normalizedLogin" = normalized_input.value
      or regexp_replace(lower(btrim(access_user."login")), '\s+', ' ', 'g') = normalized_input.value
    )
  order by
    case
      when lower(access_user."authEmail") = normalized_input.value then 0
      when access_user."normalizedLogin" = normalized_input.value then 1
      else 2
    end,
    access_user."id"
  limit 1
$$;

revoke all on function public.current_access_role() from public, anon;
revoke all on function public.is_active_access_user() from public, anon;
revoke all on function public.resolve_access_user_auth_email(text) from public;

grant execute on function public.current_access_role() to authenticated;
grant execute on function public.is_active_access_user() to authenticated;
grant execute on function public.resolve_access_user_auth_email(text) to anon, authenticated;

alter table public."AccessUser" enable row level security;
alter table public."DutyMember" enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('AccessUser', 'DutyMember')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy access_user_select_self_or_officer
on public."AccessUser"
for select
to authenticated
using (
  "authUserId" = auth.uid()
  or public.current_access_role() in ('system_admin', 'officer')
);

create policy duty_member_select_active_user
on public."DutyMember"
for select
to authenticated
using (public.is_active_access_user());

create policy duty_member_update_officer
on public."DutyMember"
for update
to authenticated
using (public.current_access_role() in ('system_admin', 'officer'))
with check (public.current_access_role() in ('system_admin', 'officer'));

revoke all on table public."AccessUser" from anon;
revoke insert, update, delete on table public."AccessUser" from authenticated;
grant select on table public."AccessUser" to authenticated;

revoke all on table public."DutyMember" from anon;
revoke insert, delete on table public."DutyMember" from authenticated;
grant select, update on table public."DutyMember" to authenticated;
