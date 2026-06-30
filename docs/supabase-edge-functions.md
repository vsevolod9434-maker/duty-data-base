# Supabase Edge Functions: controlled deploy

Фронтенд остаётся статическим сайтом GitHub Pages. Защищённые операции, которым нужны `service_role`, Supabase Auth Admin или серверная проверка прав, выносятся в Supabase Edge Functions.

Этот этап возвращает в репозиторий только серверную функцию `access-admin` и ручной workflow её деплоя. GitHub Pages UI пока не подключается к функции.

## Что добавлено

- `supabase/functions/access-admin/index.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/http.ts`
- `supabase/functions/deno.json`
- `.github/workflows/deploy-supabase-functions.yml`

Workflow запускается только вручную через `workflow_dispatch` и деплоит только функцию `access-admin`.

## Секреты GitHub Actions для deploy workflow

Добавить в GitHub repository secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
```

После добавления:

1. GitHub → репозиторий → Actions.
2. Выбрать `Deploy Supabase Edge Functions`.
3. Нажать `Run workflow`.
4. Выбрать нужную ветку.
5. Запустить workflow вручную.

## Секреты Supabase Edge Function

Установить в Supabase Function secrets:

```bash
supabase secrets set SUPABASE_URL="https://<project-ref>.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="<anon-key>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
supabase secrets set DUTY_ALLOWED_ORIGINS="https://vsevolod9434-maker.github.io"
```

`SUPABASE_ANON_KEY` используется как основной public key для user-scoped client. Если проект всё ещё использует `SUPABASE_PUBLISHABLE_KEY`, функция поддерживает его как fallback.

`DUTY_ALLOWED_ORIGINS` не должен содержать `*`. Localhost разрешается только если явно добавлен в этот список для локальной проверки.

## Security model

Функция принимает JWT текущего пользователя через `Authorization: Bearer ...`.

Порядок проверки:

1. Проверить Bearer token через Supabase Auth.
2. Найти `AccessUser` по `authUserId = auth.users.id`.
3. Убедиться, что `AccessUser.isActive = true`.
4. Проверить роль и целевой профиль.
5. Только после этого лениво создать service-role client и выполнить admin-операцию.

`service_role` и Auth Admin не используются до успешной проверки JWT и активного `AccessUser`.

## Permission matrix

| Action | Кто может выполнять | Ограничения |
| --- | --- | --- |
| `createDutyMemberUser` | `system_admin`, `officer` | `officer` может создать только базовый `regular` доступ; функция не создаёт `system_admin` |
| `resetPassword` | `system_admin`, `officer` | `officer` только для нижестоящих `regular`/`manager`; self-change запрещён; `system_admin` не управляется через функцию |
| `updateAccess` | только `system_admin` | self-change запрещён; `system_admin` не управляется через функцию |
| `excludeDutyMember` | только `system_admin` | self-change запрещён; `system_admin` не управляется через функцию |

Так как функция не позволяет управлять профилями `system_admin`, последний `system_admin` не может быть заблокирован или понижен через этот endpoint.

## Что пока не подключено

- GitHub Pages UI не вызывает `access-admin`.
- Frontend helper для вызова функции не добавлен.
- `static-api` не изменён.
- Публичная переменная URL функции для Pages build не добавлена.
- Pages workflow не изменён.

Подключение UI должно идти отдельным этапом после ручной проверки функции.
