-- Ручные интеграционные тесты для supabase/rls-policies.sql.
--
-- Предпосылки:
-- 1. На ТЕСТОВОМ Supabase-проекте применены:
--    - harden-access-user-identity.sql;
--    - remove-access-user-password.sql;
--    - rls-policies.sql;
--    - access-admin-rpc.sql;
--    - static-pages-rpc.sql.
-- 2. Есть активные AccessUser, связанные с auth.users:
--    - regular или manager;
--    - officer;
--    - system_admin.
-- 3. Есть хотя бы один DutyMember, связанный с regular/manager AccessUser.
--
-- Скрипт выполняется одной транзакцией и всегда заканчивается ROLLBACK.
-- Production-данные после успешного или неуспешного теста не сохраняются.

begin;

do $$
declare
  helper_count integer;
  authenticated_execute_count integer;
  policy_count integer;
  misplaced_policy_count integer;
begin
  if to_regnamespace('private') is null then
    raise exception
      'Schema private does not exist. Apply supabase/repair-rls-schema.sql before running tests.';
  end if;

  if has_schema_privilege('anon', 'private', 'USAGE')
     or has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'Schema private must not grant USAGE to anon/authenticated.';
  end if;

  select count(*)
  into helper_count
  from pg_proc as procedure
  join pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'private'
    and procedure.proname in (
      'current_access_user_id',
      'is_active_access_user',
      'current_access_role',
      'is_system_admin',
      'is_officer',
      'current_access_level',
      'is_duty_admin',
      'can_manage_duty_member',
      'task_assignee_is_allowed'
    )
    and procedure.prosecdef
    and procedure.proconfig @> array['search_path=pg_catalog'];

  if helper_count <> 9 then
    raise exception
      'Expected 9 SECURITY DEFINER helpers with search_path=pg_catalog in private; found %.',
      helper_count;
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'current_access_user_id',
        'is_active_access_user',
        'current_access_role',
        'is_system_admin',
        'is_officer',
        'current_access_level',
        'is_duty_admin',
        'can_manage_duty_member',
        'task_assignee_is_allowed'
      )
  ) then
    raise exception 'Legacy RLS helper functions still exist in schema public.';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname in (
        'current_access_user_id',
        'is_active_access_user',
        'current_access_role',
        'is_system_admin',
        'is_officer',
        'current_access_level',
        'is_duty_admin',
        'can_manage_duty_member',
        'task_assignee_is_allowed'
      )
      and has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ) then
    raise exception 'anon must not have EXECUTE on private RLS helpers.';
  end if;

  select count(*)
  into authenticated_execute_count
  from pg_proc as procedure
  join pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'private'
    and procedure.proname in (
      'current_access_user_id',
      'is_active_access_user',
      'current_access_role',
      'is_system_admin',
      'is_officer',
      'current_access_level',
      'is_duty_admin',
      'can_manage_duty_member',
      'task_assignee_is_allowed'
    )
    and has_function_privilege('authenticated', procedure.oid, 'EXECUTE');

  if authenticated_execute_count <> 5 then
    raise exception
      'authenticated must have EXECUTE on exactly 5 policy-facing helpers; found %.',
      authenticated_execute_count;
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname in (
        'current_access_role',
        'is_system_admin',
        'is_officer',
        'current_access_level'
      )
      and has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ) then
    raise exception 'authenticated has EXECUTE on an internal role helper.';
  end if;

  select count(*)
  into policy_count
  from pg_policies
  where schemaname = 'public'
    and policyname like 'duty_pages_%';

  if policy_count <> 74 then
    raise exception 'Expected 74 duty_pages policies; found %.', policy_count;
  end if;

  select count(*)
  into misplaced_policy_count
  from pg_policy as policy
  join pg_class as relation
    on relation.oid = policy.polrelid
  join pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and policy.polname like 'duty_pages_%'
    and (
      coalesce(pg_get_expr(policy.polqual, policy.polrelid), '')
        ~ 'public\.(current_access|is_active_access|is_system_admin|is_officer|is_duty_admin|can_manage_duty_member|task_assignee)'
      or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
        ~ 'public\.(current_access|is_active_access|is_system_admin|is_officer|is_duty_admin|can_manage_duty_member|task_assignee)'
    );

  if misplaced_policy_count <> 0 then
    raise exception '% policy expression(s) still reference public helper functions.', misplaced_policy_count;
  end if;
end
$$;

select set_config(
  'duty.test.regular_uid',
  coalesce((
    select access_user."authUserId"::text
    from public."AccessUser" as access_user
    join auth.users as auth_user
      on auth_user.id = access_user."authUserId"
    where access_user."isActive" = true
      and access_user."role" in (
        'regular'::public."AccessUserRole",
        'manager'::public."AccessUserRole"
      )
    order by access_user."role" desc
    limit 1
  ), ''),
  true
);

select set_config(
  'duty.test.officer_uid',
  coalesce((
    select access_user."authUserId"::text
    from public."AccessUser" as access_user
    join auth.users as auth_user
      on auth_user.id = access_user."authUserId"
    where access_user."isActive" = true
      and access_user."role" = 'officer'::public."AccessUserRole"
    limit 1
  ), ''),
  true
);

select set_config(
  'duty.test.admin_uid',
  coalesce((
    select access_user."authUserId"::text
    from public."AccessUser" as access_user
    join auth.users as auth_user
      on auth_user.id = access_user."authUserId"
    where access_user."isActive" = true
      and access_user."role" = 'system_admin'::public."AccessUserRole"
    limit 1
  ), ''),
  true
);

select set_config(
  'duty.test.member_id',
  coalesce((
    select duty_member."id"
    from public."DutyMember" as duty_member
    join public."AccessUser" as access_user
      on access_user."id" = duty_member."accessUserId"
    where access_user."role" in (
      'regular'::public."AccessUserRole",
      'manager'::public."AccessUserRole"
    )
    order by duty_member."id"
    limit 1
  ), ''),
  true
);

select set_config(
  'duty.test.access_user_count',
  (select count(*)::text from public."AccessUser"),
  true
);

do $$
begin
  if current_setting('duty.test.regular_uid', true) = '' then
    raise exception 'No active regular/manager AccessUser linked to auth.users.';
  end if;
  if current_setting('duty.test.officer_uid', true) = '' then
    raise exception 'No active officer AccessUser linked to auth.users.';
  end if;
  if current_setting('duty.test.admin_uid', true) = '' then
    raise exception 'No active system_admin AccessUser linked to auth.users.';
  end if;
  if current_setting('duty.test.member_id', true) = '' then
    raise exception 'No regular/manager DutyMember row available for update-policy tests.';
  end if;
end
$$;

create or replace function pg_temp.expect_denied(test_name text, statement text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  unexpectedly_succeeded boolean := false;
begin
  begin
    execute statement;
    unexpectedly_succeeded := true;
  exception
    when insufficient_privilege or check_violation then
      return;
  end;

  if unexpectedly_succeeded then
    raise exception 'Expected denial, but test succeeded: %', test_name;
  end if;
end
$$;

create or replace function pg_temp.expect_row_count(
  test_name text,
  statement text,
  expected_count integer
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  affected_rows integer;
begin
  execute statement;
  get diagnostics affected_rows = row_count;

  if affected_rows <> expected_count then
    raise exception
      'Unexpected row count for %: expected %, got %',
      test_name,
      expected_count,
      affected_rows;
  end if;
end
$$;

create or replace function pg_temp.expect_access_user_read_only(actor_label text, expect_directory boolean)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  visible_rows integer;
begin
  if expect_directory then
    select count(*)
    into visible_rows
    from public."AccessUser";
  else
    select count(*)
    into visible_rows
    from public."AccessUser"
    where "authUserId"::text = auth.uid()::text;
  end if;

  if expect_directory then
    if visible_rows <> current_setting('duty.test.access_user_count')::integer then
      raise exception
        'AccessUser directory SELECT failed for %: expected %, got %',
        actor_label,
        current_setting('duty.test.access_user_count')::integer,
        visible_rows;
    end if;
  elsif visible_rows <> 1 then
    raise exception 'AccessUser SELECT failed for %: expected own row, got %', actor_label, visible_rows;
  end if;

  perform pg_temp.expect_denied(
    actor_label || ' AccessUser INSERT',
    'insert into public."AccessUser" (
       "id", "authUserId", "authEmail", "login", "normalizedLogin",
       "role", "isActive", "createdAt", "updatedAt"
     ) values (
       ''rls-test-access-user'', ''00000000-0000-4000-8000-000000000001'',
       ''rls-test@example.invalid'', ''rls-test'', ''rls-test'',
       ''regular'', true, now(), now()
     )'
  );
  perform pg_temp.expect_denied(
    actor_label || ' AccessUser UPDATE',
    'update public."AccessUser" set "role" = ''system_admin''
     where "authUserId"::text = auth.uid()::text'
  );
  perform pg_temp.expect_denied(
    actor_label || ' AccessUser DELETE',
    'delete from public."AccessUser"
     where "authUserId"::text = auth.uid()::text'
  );
end
$$;

create or replace function pg_temp.expect_working_crud(actor_label text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  row_id text := 'rls-test-' || md5(clock_timestamp()::text || random()::text);
  affected_rows integer;
begin
  insert into public."Stalker" (
    "id",
    "fullName",
    "callsign",
    "status",
    "createdAt",
    "updatedAt"
  )
  values (
    row_id,
    'RLS test ' || actor_label,
    'RLS-' || actor_label,
    'active'::public."StalkerProfileStatus",
    clock_timestamp(),
    clock_timestamp()
  );

  perform 1 from public."Stalker" where "id" = row_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'SELECT failed for %', actor_label;
  end if;

  update public."Stalker"
  set "notes" = 'updated by ' || actor_label,
      "updatedAt" = clock_timestamp()
  where "id" = row_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'UPDATE failed for %', actor_label;
  end if;

  delete from public."Stalker" where "id" = row_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'DELETE failed for %', actor_label;
  end if;
end
$$;

-- anon: все CRUD запрещены.
set local role anon;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000000',
  true
);

select pg_temp.expect_denied(
  'anon SELECT',
  'select * from public."Stalker" limit 1'
);
select pg_temp.expect_denied(
  'anon INSERT',
  'insert into public."Stalker" ("id","fullName","callsign","status","createdAt","updatedAt")
   values (''rls-anon'', ''anon'', ''anon'', ''active'', now(), now())'
);
select pg_temp.expect_denied(
  'anon UPDATE',
  'update public."Stalker" set "updatedAt" = now() where false'
);
select pg_temp.expect_denied(
  'anon DELETE',
  'delete from public."Stalker" where false'
);
reset role;

-- Обычный active user: CRUD рабочих данных разрешён, админские операции нет.
select set_config(
  'request.jwt.claim.sub',
  current_setting('duty.test.regular_uid'),
  true
);

do $$
begin
  if not private.is_active_access_user() then
    raise exception 'regular user must be active';
  end if;
  if private.is_system_admin() or private.is_officer() then
    raise exception 'regular user received administrative role';
  end if;
  if private.current_access_level() <> 'basic' then
    raise exception 'regular user must have basic access level';
  end if;
end
$$;

set local role authenticated;
select pg_temp.expect_working_crud('regular');
select pg_temp.expect_access_user_read_only('regular', false);
select pg_temp.expect_row_count(
  'regular DutyMember SELECT',
  format(
    'select 1 from public."DutyMember" where "id" = %L',
    current_setting('duty.test.member_id')
  ),
  1
);
select pg_temp.expect_row_count(
  'regular DutyMember UPDATE denied by RLS',
  format(
    'update public."DutyMember" set "updatedAt" = "updatedAt" where "id" = %L',
    current_setting('duty.test.member_id')
  ),
  0
);
select pg_temp.expect_denied(
  'regular DutyMember INSERT',
  'insert into public."DutyMember" ("id","fullName","serviceStatus","profileStatus","createdAt","updatedAt")
   values (''rls-regular-member'', ''test'', ''active'', ''active'', now(), now())'
);
select pg_temp.expect_denied(
  'regular DutyMember DELETE',
  'delete from public."DutyMember" where false'
);
reset role;

-- officer: CRUD рабочих данных и UPDATE DutyMember разрешены,
-- INSERT/DELETE DutyMember и изменение AccessUser запрещены.
select set_config(
  'request.jwt.claim.sub',
  current_setting('duty.test.officer_uid'),
  true
);

do $$
begin
  if not private.is_active_access_user() or not private.is_officer() then
    raise exception 'officer identity check failed';
  end if;
  if private.is_system_admin() then
    raise exception 'officer must not become system_admin';
  end if;
  if private.current_access_level() <> 'officer' then
    raise exception 'officer access level mismatch';
  end if;
end
$$;

set local role authenticated;
select pg_temp.expect_working_crud('officer');
select pg_temp.expect_access_user_read_only('officer', true);
select pg_temp.expect_row_count(
  'officer DutyMember SELECT',
  format(
    'select 1 from public."DutyMember" where "id" = %L',
    current_setting('duty.test.member_id')
  ),
  1
);
select pg_temp.expect_row_count(
  'officer DutyMember UPDATE',
  format(
    'update public."DutyMember" set "updatedAt" = "updatedAt" where "id" = %L',
    current_setting('duty.test.member_id')
  ),
  1
);
select pg_temp.expect_denied(
  'officer DutyMember INSERT',
  'insert into public."DutyMember" ("id","fullName","serviceStatus","profileStatus","createdAt","updatedAt")
   values (''rls-officer-member'', ''test'', ''active'', ''active'', now(), now())'
);
select pg_temp.expect_denied(
  'officer DutyMember DELETE',
  'delete from public."DutyMember" where false'
);
reset role;

-- system_admin: те же браузерные CRUD-права на данные и DutyMember UPDATE.
-- Управление Auth/AccessUser остаётся серверным.
select set_config(
  'request.jwt.claim.sub',
  current_setting('duty.test.admin_uid'),
  true
);

do $$
begin
  if not private.is_active_access_user() or not private.is_system_admin() then
    raise exception 'system_admin identity check failed';
  end if;
  if private.is_officer() then
    raise exception 'system_admin must not be treated as officer';
  end if;
  if private.current_access_level() <> 'system_admin' then
    raise exception 'system_admin access level mismatch';
  end if;
end
$$;

set local role authenticated;
select pg_temp.expect_working_crud('system-admin');
select pg_temp.expect_access_user_read_only('system_admin', true);
select pg_temp.expect_row_count(
  'system_admin DutyMember SELECT',
  format(
    'select 1 from public."DutyMember" where "id" = %L',
    current_setting('duty.test.member_id')
  ),
  1
);
select pg_temp.expect_row_count(
  'system_admin DutyMember UPDATE',
  format(
    'update public."DutyMember" set "updatedAt" = "updatedAt" where "id" = %L',
    current_setting('duty.test.member_id')
  ),
  1
);
select pg_temp.expect_denied(
  'system_admin DutyMember INSERT',
  'insert into public."DutyMember" ("id","fullName","serviceStatus","profileStatus","createdAt","updatedAt")
   values (''rls-admin-member'', ''test'', ''active'', ''active'', now(), now())'
);
select pg_temp.expect_denied(
  'system_admin DutyMember DELETE',
  'delete from public."DutyMember" where false'
);
reset role;

-- RPC exposure: browser can atomically rename a layer under RLS, but duty-member
-- exclusion remains service-role-only behind the access-admin Edge Function.
do $
begin
  if has_function_privilege('anon', 'public.rename_map_layer_transaction(text,text,text)', 'EXECUTE') then
    raise exception 'anon must not execute rename_map_layer_transaction.';
  end if;
  if not has_function_privilege('authenticated', 'public.rename_map_layer_transaction(text,text,text)', 'EXECUTE') then
    raise exception 'authenticated must execute rename_map_layer_transaction.';
  end if;
  if has_function_privilege('anon', 'public.exclude_duty_member_transaction(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.exclude_duty_member_transaction(text)', 'EXECUTE') then
    raise exception 'browser roles must not execute exclude_duty_member_transaction.';
  end if;
  if not has_function_privilege('service_role', 'public.exclude_duty_member_transaction(text)', 'EXECUTE') then
    raise exception 'service_role must execute exclude_duty_member_transaction.';
  end if;
end
$;

rollback;
