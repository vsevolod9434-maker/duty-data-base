-- Закрывающий rollback для supabase/rls-policies.sql.
-- Он возвращает Data API в deny-by-default состояние, удаляя созданные
-- политики, grants и helper-функции. Он намеренно НЕ возвращает публичный
-- EXECUTE на public.rls_auto_enable().

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

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

revoke all privileges on all tables in schema public from anon, authenticated;

drop function if exists private.task_assignee_is_allowed(
  public."TaskAssigneeType",
  text,
  text
);
drop function if exists private.is_duty_admin();
drop function if exists private.current_access_level();
drop function if exists private.is_officer();
drop function if exists private.is_system_admin();
drop function if exists private.current_access_role();
drop function if exists private.is_active_access_user();
drop function if exists private.current_access_user_id();

-- Удаляем возможные helper-функции из legacy-варианта, где они были созданы
-- в public. Политики уже удалены, поэтому зависимостей от них быть не должно.
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

do $$
begin
  if not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
  ) and not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
  ) then
    drop schema if exists private;
  else
    raise notice 'private schema contains unrelated objects and was preserved.';
  end if;
end
$$;

commit;
