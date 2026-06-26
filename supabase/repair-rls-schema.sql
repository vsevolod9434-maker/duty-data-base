-- Repair для БД, где RLS helpers/policies были применены не полностью
-- или helper-функции оказались не в схеме private.
--
-- Скрипт:
-- - транзакционный и идемпотентный;
-- - не отключает RLS;
-- - пересоздаёт только политики duty_pages_*;
-- - не предоставляет USAGE схемы private браузерным ролям;
-- - не применяется автоматически.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

create or replace function private.current_access_user_id()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select access_user."id"
  from public."AccessUser" as access_user
  where access_user."authUserId"::text = auth.uid()::text
    and access_user."isActive" = true
  limit 1
$$;

create or replace function private.is_active_access_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.current_access_user_id() is not null
$$;

create or replace function private.current_access_role()
returns public."AccessUserRole"
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select access_user."role"
  from public."AccessUser" as access_user
  where access_user."authUserId"::text = auth.uid()::text
    and access_user."isActive" = true
  limit 1
$$;

create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.current_access_role() = 'system_admin'::public."AccessUserRole"
$$;

create or replace function private.is_officer()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.current_access_role() = 'officer'::public."AccessUserRole"
$$;

create or replace function private.current_access_level()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case private.current_access_role()
    when 'system_admin'::public."AccessUserRole" then 'system_admin'
    when 'officer'::public."AccessUserRole" then 'officer'
    when 'manager'::public."AccessUserRole" then 'basic'
    when 'regular'::public."AccessUserRole" then 'basic'
    else null
  end
$$;

create or replace function private.is_duty_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select private.is_system_admin() or private.is_officer()
$$;

create or replace function private.task_assignee_is_allowed(
  assignee_type public."TaskAssigneeType",
  stalker_id text,
  group_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select case
    when assignee_type = 'stalker'::public."TaskAssigneeType" then
      stalker_id is not null
      and exists (
        select 1
        from public."Stalker" as stalker
        where stalker."id" = stalker_id
          and stalker."affiliation" is distinct from 'duty'::public."StalkerAffiliation"
      )
    when assignee_type = 'group'::public."TaskAssigneeType" then
      group_id is not null
      and exists (
        select 1
        from public."StalkerGroup" as stalker_group
        where stalker_group."id" = group_id
      )
      and not exists (
        select 1
        from public."StalkerGroupMember" as membership
        join public."Stalker" as stalker
          on stalker."id" = membership."stalkerId"
        where membership."groupId" = group_id
          and stalker."affiliation" = 'duty'::public."StalkerAffiliation"
      )
    when assignee_type = 'manual'::public."TaskAssigneeType" then true
    else false
  end
$$;

revoke all on function private.current_access_user_id() from public, anon, authenticated;
revoke all on function private.is_active_access_user() from public, anon, authenticated;
revoke all on function private.current_access_role() from public, anon, authenticated;
revoke all on function private.is_system_admin() from public, anon, authenticated;
revoke all on function private.is_officer() from public, anon, authenticated;
revoke all on function private.current_access_level() from public, anon, authenticated;
revoke all on function private.is_duty_admin() from public, anon, authenticated;
revoke all on function private.task_assignee_is_allowed(
  public."TaskAssigneeType",
  text,
  text
) from public, anon, authenticated;

-- Только эти функции непосредственно вызываются сохранёнными RLS expressions.
-- Без USAGE схемы private они не доступны для прямого вызова браузерным SQL.
grant execute on function private.is_active_access_user() to authenticated;
grant execute on function private.is_duty_admin() to authenticated;
grant execute on function private.current_access_user_id() to authenticated;
grant execute on function private.task_assignee_is_allowed(
  public."TaskAssigneeType",
  text,
  text
) to authenticated;

revoke all privileges on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select (
  "id",
  "authUserId",
  "login",
  "displayName",
  "role",
  "isActive"
) on public."AccessUser" to authenticated;

grant select, insert, update, delete on
  public."Stalker",
  public."StalkerGroup",
  public."Apartment",
  public."Task",
  public."TradeOperation",
  public."Violation",
  public."MapMarker",
  public."MapLabel",
  public."MapZone",
  public."MapRoute"
to authenticated;

grant select, insert, delete on
  public."StalkerGroupMember",
  public."ApartmentTenant",
  public."ApartmentPayment",
  public."TradeOperationItem",
  public."MapZonePoint",
  public."MapRoutePoint"
to authenticated;

grant select on public."StalkerNote" to authenticated;
grant insert (
  "id",
  "stalkerId",
  "text",
  "createdBy",
  "createdByAccessUserId",
  "createdAt",
  "updatedAt"
) on public."StalkerNote" to authenticated;
grant update (
  "text",
  "updatedBy",
  "updatedAt"
) on public."StalkerNote" to authenticated;
grant delete on public."StalkerNote" to authenticated;

grant select on public."MapLayer" to authenticated;
grant insert (
  "id",
  "name",
  "normalizedName",
  "isDefault",
  "createdAt",
  "updatedAt"
) on public."MapLayer" to authenticated;
grant update (
  "name",
  "normalizedName",
  "updatedAt"
) on public."MapLayer" to authenticated;
grant delete on public."MapLayer" to authenticated;

grant select on
  public."SupplyCatalogCategory",
  public."SupplyCatalogItem",
  public."DutyStaffSection",
  public."DutyStaffPosition"
to authenticated;

grant select on public."DutyMember" to authenticated;
grant update (
  "fullName",
  "callSign",
  "callsign",
  "birthDate",
  "appearance",
  "rank",
  "position",
  "staffPositionId",
  "unit",
  "photoUrl",
  "serviceStatus",
  "profileStatus",
  "notes",
  "updatedAt"
) on public."DutyMember" to authenticated;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'duty_pages_%'
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'Stalker',
    'StalkerGroup',
    'Apartment',
    'TradeOperation',
    'Violation',
    'MapMarker',
    'MapLabel',
    'MapZone',
    'MapRoute'
  ]
  loop
    execute format(
      'create policy duty_pages_select on public.%I for select to authenticated using (private.is_active_access_user())',
      table_name
    );
    execute format(
      'create policy duty_pages_insert on public.%I for insert to authenticated with check (private.is_active_access_user())',
      table_name
    );
    execute format(
      'create policy duty_pages_update on public.%I for update to authenticated using (private.is_active_access_user()) with check (private.is_active_access_user())',
      table_name
    );
    execute format(
      'create policy duty_pages_delete on public.%I for delete to authenticated using (private.is_active_access_user())',
      table_name
    );
  end loop;
end
$$;

create policy duty_pages_select
on public."Task"
for select
to authenticated
using (private.is_active_access_user());

create policy duty_pages_insert
on public."Task"
for insert
to authenticated
with check (
  private.is_active_access_user()
  and private.task_assignee_is_allowed("assigneeType", "stalkerId", "groupId")
);

create policy duty_pages_update
on public."Task"
for update
to authenticated
using (private.is_active_access_user())
with check (
  private.is_active_access_user()
  and private.task_assignee_is_allowed("assigneeType", "stalkerId", "groupId")
);

create policy duty_pages_delete
on public."Task"
for delete
to authenticated
using (private.is_active_access_user());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'StalkerGroupMember',
    'ApartmentTenant',
    'ApartmentPayment',
    'TradeOperationItem',
    'MapZonePoint',
    'MapRoutePoint'
  ]
  loop
    execute format(
      'create policy duty_pages_select on public.%I for select to authenticated using (private.is_active_access_user())',
      table_name
    );
    execute format(
      'create policy duty_pages_insert on public.%I for insert to authenticated with check (private.is_active_access_user())',
      table_name
    );
    execute format(
      'create policy duty_pages_delete on public.%I for delete to authenticated using (private.is_active_access_user())',
      table_name
    );
  end loop;
end
$$;

create policy duty_pages_select
on public."AccessUser"
for select
to authenticated
using (private.is_active_access_user());

create policy duty_pages_select
on public."StalkerNote"
for select
to authenticated
using (private.is_active_access_user());

create policy duty_pages_insert
on public."StalkerNote"
for insert
to authenticated
with check (
  private.is_active_access_user()
  and "createdByAccessUserId" = private.current_access_user_id()
);

create policy duty_pages_update
on public."StalkerNote"
for update
to authenticated
using (
  private.is_duty_admin()
  or "createdByAccessUserId" = private.current_access_user_id()
)
with check (
  private.is_duty_admin()
  or "createdByAccessUserId" = private.current_access_user_id()
);

create policy duty_pages_delete
on public."StalkerNote"
for delete
to authenticated
using (
  private.is_duty_admin()
  or "createdByAccessUserId" = private.current_access_user_id()
);

create policy duty_pages_select
on public."MapLayer"
for select
to authenticated
using (private.is_active_access_user());

create policy duty_pages_insert
on public."MapLayer"
for insert
to authenticated
with check (
  private.is_active_access_user()
  and "isDefault" = false
);

create policy duty_pages_update
on public."MapLayer"
for update
to authenticated
using (
  private.is_active_access_user()
  and "isDefault" = false
)
with check (
  private.is_active_access_user()
  and "isDefault" = false
);

create policy duty_pages_delete
on public."MapLayer"
for delete
to authenticated
using (
  private.is_active_access_user()
  and "isDefault" = false
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'SupplyCatalogCategory',
    'SupplyCatalogItem',
    'DutyStaffSection',
    'DutyStaffPosition'
  ]
  loop
    execute format(
      'create policy duty_pages_select on public.%I for select to authenticated using (private.is_active_access_user())',
      table_name
    );
  end loop;
end
$$;

create policy duty_pages_select
on public."DutyMember"
for select
to authenticated
using (private.is_active_access_user());

create policy duty_pages_update
on public."DutyMember"
for update
to authenticated
using (private.is_duty_admin())
with check (private.is_duty_admin());

-- Удаляем helper-функции legacy-варианта из public только после пересоздания
-- duty_pages_* на private. DROP без CASCADE защищает посторонние зависимости.
drop function if exists public.task_assignee_is_allowed(
  public."TaskAssigneeType",
  text,
  text
);
drop function if exists public.is_duty_admin();
drop function if exists public.current_access_level();
drop function if exists public.is_officer();
drop function if exists public.is_system_admin();
drop function if exists public.current_access_role();
drop function if exists public.is_active_access_user();
drop function if exists public.current_access_user_id();

commit;
