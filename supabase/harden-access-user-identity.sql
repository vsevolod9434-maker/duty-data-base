-- Не применяется автоматически.
-- Усиливает связь public."AccessUser"."authUserId" -> auth.users.id.
--
-- Текущее production-состояние перед этой миграцией должно быть очищено от
-- сиротских AccessUser. Миграция намеренно завершится ошибкой, если найдёт
-- некорректный UUID или отсутствующую запись auth.users.

begin;

lock table public."AccessUser" in share row exclusive mode;

do $$
declare
  invalid_uuid_count integer;
  orphaned_count integer;
begin
  select count(*)
  into invalid_uuid_count
  from public."AccessUser"
  where "authUserId"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  if invalid_uuid_count > 0 then
    raise exception
      'AccessUser.authUserId contains % invalid UUID value(s). Migration aborted.',
      invalid_uuid_count;
  end if;

  select count(*)
  into orphaned_count
  from public."AccessUser" as access_user
  left join auth.users as auth_user
    on auth_user.id::text = access_user."authUserId"::text
  where auth_user.id is null;

  if orphaned_count > 0 then
    raise exception
      'AccessUser contains % row(s) without matching auth.users.id. Resolve them before migration.',
      orphaned_count;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'AccessUser'
      and column_name = 'authUserId'
      and data_type <> 'uuid'
  ) then
    alter table public."AccessUser"
      alter column "authUserId" type uuid
      using "authUserId"::uuid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public."AccessUser"'::regclass
      and conname = 'AccessUser_authUserId_auth_users_fkey'
  ) then
    alter table public."AccessUser"
      add constraint "AccessUser_authUserId_auth_users_fkey"
      foreign key ("authUserId")
      references auth.users(id)
      on update cascade
      on delete restrict;
  end if;
end
$$;

-- Браузерные роли не могут изменять привязку к auth.users.
revoke update ("authUserId") on public."AccessUser" from anon, authenticated;

commit;
