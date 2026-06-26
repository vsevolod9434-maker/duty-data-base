-- Не применяется автоматически.
-- Предпосылка: приложение уже аутентифицирует и меняет пароли только через
-- Supabase Auth и больше не читает/пишет public."AccessUser"."password".
--
-- Открытые пароли намеренно НЕ переносятся в auth.users.
-- После COMMIT восстановить прежние значения невозможно.

begin;

lock table public."AccessUser" in access exclusive mode;

do $$
declare
  dependent_objects integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'AccessUser'
      and column_name = 'password'
  ) then
    raise notice 'AccessUser.password is already absent; nothing to do.';
    return;
  end if;

  select count(*)
  into dependent_objects
  from pg_depend as dependency
  join pg_attribute as attribute
    on attribute.attrelid = dependency.refobjid
   and attribute.attnum = dependency.refobjsubid
  where dependency.refobjid = 'public."AccessUser"'::regclass
    and attribute.attname = 'password'
    and dependency.deptype = 'n';

  if dependent_objects > 0 then
    raise exception
      'AccessUser.password still has % dependent database object(s). Migration aborted.',
      dependent_objects;
  end if;

  -- Сначала уничтожаем plaintext-значения внутри текущей транзакции.
  update public."AccessUser"
  set "password" = null
  where "password" is not null;

  alter table public."AccessUser"
    drop column "password";
end
$$;

commit;
