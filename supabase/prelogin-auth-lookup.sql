-- Duty RP Control System: безопасный pre-login lookup для статического GitHub Pages клиента.
--
-- Этот файл не применяется автоматически. Он нужен, если на GitHub Pages должен
-- сохраниться вход по внутреннему login/displayName, а не только по Supabase Auth email.
--
-- Функция возвращает только authEmail активной AccessUser-записи по точному совпадению:
-- - authEmail;
-- - normalizedLogin;
-- - login после той же базовой нормализации;
-- - displayName после той же базовой нормализации.
--
-- Прямой SELECT по public."AccessUser" для anon не выдаётся.

begin;

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
      or regexp_replace(lower(btrim(coalesce(access_user."displayName", ''))), '\s+', ' ', 'g') = normalized_input.value
    )
  order by
    case
      when lower(access_user."authEmail") = normalized_input.value then 0
      when access_user."normalizedLogin" = normalized_input.value then 1
      when regexp_replace(lower(btrim(access_user."login")), '\s+', ' ', 'g') = normalized_input.value then 2
      else 3
    end,
    access_user."id"
  limit 1
$$;

revoke all on function public.resolve_access_user_auth_email(text) from public, anon, authenticated;
grant execute on function public.resolve_access_user_auth_email(text) to anon, authenticated;

commit;
