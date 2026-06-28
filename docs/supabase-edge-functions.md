# Supabase Edge Functions для GitHub Pages

Фронтенд остаётся статическим GitHub Pages сайтом. Операции, которым нужен
`service_role`, Supabase Auth Admin или защищённая серверная логика, выносятся в
Supabase Edge Functions.

## Общая схема

1. Браузер вызывает Edge Function и передаёт JWT текущей Supabase-сессии в
   `Authorization: Bearer ...`.
2. Edge Function проверяет JWT через Supabase Auth.
3. Edge Function ищет активную запись `AccessUser` по `authUserId = auth.uid()`.
4. Edge Function проверяет роль: `system_admin` или `officer`.
5. Только после этого функция использует `SUPABASE_SERVICE_ROLE_KEY` и
   `auth.admin.*`.

`service_role`, database URL, direct URL и приватные ключи не добавляются во
фронтенд.

## Первый восстановленный срез: `access-admin`

Файл функции: `supabase/functions/access-admin/index.ts`.

Публичная переменная фронтенда:

```env
NEXT_PUBLIC_ACCESS_ADMIN_FUNCTION_URL=https://<project-ref>.functions.supabase.co/access-admin
```

Если переменная не задана, GitHub Pages сайт оставляет прежние мягкие блокировки
для защищённых операций.

На controlled-deploy этапе не добавляйте `NEXT_PUBLIC_ACCESS_ADMIN_FUNCTION_URL`
в GitHub Pages workflow до ручной проверки Edge Function. Без этой переменной
интерфейс остаётся в безопасном fallback-режиме и не включает защищённые кнопки
для статического сайта.

## GitHub Actions deploy workflow

Файл ручного деплоя: `.github/workflows/deploy-supabase-functions.yml`.

Workflow запускается только вручную через `workflow_dispatch` и деплоит только
функцию `access-admin`.

GitHub Actions Secrets для deploy workflow:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
```

После добавления secrets workflow можно запустить вручную:

1. GitHub → репозиторий → Actions.
2. Выбрать workflow `Deploy Supabase Edge Functions`.
3. Нажать `Run workflow`.
4. Выбрать ветку `main`.
5. Нажать зелёную кнопку `Run workflow`.

Этот workflow не включает UI на GitHub Pages. UI начнёт вызывать функцию только
после отдельного добавления `NEXT_PUBLIC_ACCESS_ADMIN_FUNCTION_URL` в Pages
build.

Секреты Edge Function:

```bash
supabase secrets set SUPABASE_URL="https://<project-ref>.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="<anon-or-publishable-key>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
supabase secrets set DUTY_ALLOWED_ORIGINS="https://vsevolod9434-maker.github.io"
```

Для локальной проверки можно временно расширить allowlist:

```bash
supabase secrets set DUTY_ALLOWED_ORIGINS="https://vsevolod9434-maker.github.io,http://localhost:3000,http://localhost:4173,http://127.0.0.1:4173"
```

Не храните реальные значения в репозитории.

Деплой после проверки:

```bash
supabase functions deploy access-admin
```

Функция поддерживает действия:

- `createDutyMemberUser` — создаёт пользователя Supabase Auth, запись
  `AccessUser` и профиль `DutyMember`; `officer` может выдать только базовый
  допуск;
- `resetPassword` — меняет пароль чужого пользователя через Auth Admin;
- `updateAccess` — меняет `AccessUser.role` и/или `AccessUser.isActive`;
  доступно только `system_admin`;
- `excludeDutyMember` — архивирует профиль состава и блокирует доступ; доступно
  только `system_admin`.

Ограничения первого среза:

- штатно-должностные назначения не восстанавливаются;
- массовые импорты ещё не восстановлены;
- создание дефолтных квартир ещё не восстановлено;
- dashboard aggregates пока остаются на текущей клиентской/статической логике.

## Аудит старых backend-only маршрутов

| Старый endpoint | Что делает | Таблицы | Auth Admin | service_role | Права | Решение |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/duty-members/users` | Создаёт пользователя доступа и профиль состава | `auth.users`, `AccessUser`, `DutyMember` | Да | Да | `system_admin`/`officer` | `access-admin:createDutyMemberUser` |
| `PATCH /api/duty-members/[id]/password` | Сбрасывает чужой пароль | `auth.users`, `AccessUser`, `DutyMember` | Да | Да | `system_admin`/`officer`, не свой профиль, офицер не управляет system admin | `access-admin:resetPassword` |
| `PATCH /api/duty-members/[id]/access` | Меняет роль/активность допуска | `AccessUser`, `DutyMember` | Нет | Да | `system_admin`/`officer`, не свой профиль | `access-admin:updateAccess` |
| `DELETE /api/duty-members/[id]` | Исключает из состава и блокирует доступ | `DutyMember`, `AccessUser`, раньше также `DutyStaffPosition` | Нет | Да | `system_admin`/`officer`, не свой профиль | `access-admin:excludeDutyMember`; штатные назначения не восстанавливаются |
| `PATCH /api/duty-members/[id]` | Редактирует профиль состава и access binding | `DutyMember`, `AccessUser` | Нет | Да для защищённого связывания доступа | `system_admin`/`officer` | будущий `access-admin:updateDutyMemberBinding` или RLS rewrite |
| `POST /api/duty-members` | Создаёт профиль состава для существующего доступа | `DutyMember`, `AccessUser` | Нет | Да для защищённой связки | `system_admin`/`officer` | будущий `access-admin:createDutyMemberForExistingAccess` или RLS rewrite |
| `GET /api/duty-members` | Читает состав | `DutyMember`, `AccessUser`, `DutyStaffPosition` | Нет | Нет | active authenticated | оставить через browser client + RLS |
| `GET /api/duty-members/access-users` | Читает безопасный список доступов | `AccessUser`, `DutyMember` | Нет | Нет | `system_admin`/`officer` | оставить через browser client + RLS |
| `GET /api/duty-members/staff-list` | Читает штатный список | `DutyStaffSection`, `DutyStaffPosition`, `DutyMember` | Нет | Нет | `system_admin`/`officer` | to be removed |
| `PATCH /api/duty-members/staff-list/positions/[id]` | Назначает/снимает должность | `DutyStaffPosition`, `DutyMember` | Нет | Да | `system_admin`/`officer` | to be removed |
| `PATCH /api/duty-members/staff-list/positions` | Массовое назначение должностей | `DutyStaffPosition`, `DutyMember` | Нет | Да | `system_admin`/`officer` | to be removed |
| `POST /api/apartments/defaults` | Создаёт дефолтные квартиры | `Apartment` | Нет | Да для защищённой транзакционной инициализации | active authenticated или admin, уточнить | будущий `apartment-admin:createDefaults` |
| `POST /api/*/import` | Массово импортирует локальные записи | соответствующие таблицы и связи | Нет | Да для bulk/tranзакций | active authenticated, лучше officer/admin | будущий `import-admin` |
| `GET /api/dashboard/summary` | Считает агрегаты панели | `Stalker`, `StalkerGroup`, `Task`, `Violation`, `TradeOperation`, `Apartment` | Нет | Нет | active authenticated | оставить клиентский расчёт/RLS или `dashboard-summary`, если понадобится |

## План удаления штатно-должностного списка

Пока ничего из этого не удалено. Для отдельного этапа:

1. Удалить страницу `src/app/duty-members/staff-list/page.tsx`.
2. Убрать ссылки на `/duty-members/staff-list/` из навигации и карточек.
3. Удалить/законсервировать API routes:
   - `src/app/api/duty-members/staff-list/route.ts`;
   - `src/app/api/duty-members/staff-list/positions/route.ts`;
   - `src/app/api/duty-members/staff-list/positions/[id]/route.ts`;
   - `src/app/api/duty-members/staff-list/staff-list-route-utils.ts`.
4. Удалить UI назначения должностей из `src/app/duty-members/page.tsx`.
5. Проверить неиспользуемые helpers: `src/lib/duty-staff-list.ts`,
   `scripts/seed-duty-staff.ts`, связанные типы.
6. Таблицы и SQL (`DutyStaffSection`, `DutyStaffPosition`) пока не трогать:
   они могут быть нужны для исторических данных и отдельной миграции.

## Ручная проверка после деплоя функции

1. Убедиться, что пользователь вошёл и имеет роль `system_admin` или `officer`.
2. Создать тестового пользователя состава с префиксом `TEST_CODEX_`.
3. Сбросить ему пароль.
4. Изменить уровень допуска.
5. Заблокировать/восстановить доступ.
6. Исключить тестовый профиль из состава.
7. В DevTools проверить, что браузер вызывает только Edge Function URL, а не
   локальные Next.js `/api` routes на GitHub Pages.
