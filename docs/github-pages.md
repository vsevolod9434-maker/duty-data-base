# Публикация на GitHub Pages

## Адрес

Workflow собирает проект с `basePath`, равным имени репозитория. Для текущего
репозитория адрес публикации:

`https://vsevolod9434-maker.github.io/duty-data-base/`

## Настройка GitHub

1. Откройте `Settings → Pages`.
2. В `Build and deployment` выберите источник `GitHub Actions`.
3. Текущие публичные `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` и
   `NEXT_PUBLIC_ACCESS_ADMIN_FUNCTION_URL` уже зафиксированы в
   `.github/workflows/deploy-pages.yml`.
4. Никогда не добавляйте в `NEXT_PUBLIC_*` service-role key, пароль БД или
   Supabase access token.
5. Запустите workflow `Deploy GitHub Pages` вручную либо отправьте изменения в
   ветку `main`.

Workflow выполняет `npm ci`, `npm run lint`, `npm test`,
`npm run build:pages`, загружает каталог `out` и публикует его через официальный
GitHub Pages action.

## Что изменено для статического режима

- Next.js использует `output: "export"`, `trailingSlash`,
  `images.unoptimized`, `basePath` и `assetPrefix`.
- Пути к логотипу, плейсхолдерам, тайлам карты, CSS и JavaScript учитывают
  подкаталог репозитория.
- Middleware и Route Handlers не попадают в статическую сборку.
- Вход выполняется непосредственно через Supabase Auth в браузере.
- Чтение и основные CRUD-операции выполняются через Supabase JS и публичный
  publishable/anon key.
- Обычная Vercel-сборка и существующие серверные обработчики сохранены:
  `npm run build` продолжает собирать серверную версию.

В проекте сейчас нет использования Supabase Storage и Realtime. Браузерный
Supabase-клиент совместим с ними, но отдельного кода Storage/Realtime для
переноса не обнаружено.

## Обязательное условие безопасности

GitHub Pages полностью публичен как хостинг. Защита данных должна выполняться
Supabase Auth, Row Level Security и правами PostgreSQL. До публикации необходимо
убедиться, что:

- анонимный пользователь не может читать или изменять рабочие таблицы;
- authenticated-пользователь видит только разрешённые ему данные;
- роль и активность пользователя проверяются по `auth.uid()`;
- приложение больше не читает и не сохраняет `AccessUser.password`; отдельная
  подготовленная миграция сначала обнуляет plaintext-значения, затем удаляет столбец;
- политики отдельно ограничивают административные изменения состава и доступа.

Канонический набор политик находится в `supabase/rls-policies.sql`.
Одноразовый legacy-файл `static-pages-access-hardening.sql` удалён и не должен
использоваться. Для аварийного восстановления RLS применяется только
`supabase/repair-rls-schema.sql`, синхронизированный с каноническим файлом.

## Серверные и Edge-операции

На GitHub Pages административные операции с Auth выполняет защищённая Supabase
Edge Function `access-admin`. Через неё работают:

- создание пользователя и профиля состава;
- сброс пароля другого пользователя;
- блокировка/разблокировка доступа;
- смена уровня допуска с проверкой иерархии ролей;
- редактирование и исключение профиля состава.

Исключение состава использует service-role-only RPC
`exclude_duty_member_transaction`, поэтому блокировка доступа, освобождение
штатных должностей и архивирование выполняются одной транзакцией.

В браузере также доступно создание двух базовых квартир. Переименование слоя
карты выполняется через authenticated RPC `rename_map_layer_transaction` и
атомарно обновляет сам слой и связанные объекты.

По-прежнему не переносятся в браузер массовые import-маршруты и серверное
назначение штатных должностей. Текущий Pages-интерфейс их не вызывает.


## Порядок развёртывания новой Supabase-базы

После применения Prisma migrations выполните, по порядку:

1. `supabase/remove-access-user-password.sql`;
2. `supabase/harden-access-user-identity.sql`;
3. `supabase/prelogin-auth-lookup.sql`;
4. `supabase/rls-policies.sql`;
5. `supabase/access-admin-rpc.sql`;
6. `supabase/static-pages-rpc.sql`;
7. при необходимости `supabase/repair-service-role-access-admin-grants.sql`.

Если проект уже настроен по старому `rls-policies.sql`, для пополнения каталога
снабжения из калькулятора дополнительно примените
`supabase/calculator-catalog-write.sql`.

Затем разверните `supabase/functions/access-admin` и создайте штатные записи
командой `npm run duty-staff:seed`. После любых изменений RLS рекомендуется
прогнать `supabase/rls-policy-tests.sql` на отдельном тестовом проекте.

## Локальная проверка

```powershell
$env:NEXT_PUBLIC_BASE_PATH="/duty-data-base"
$env:NEXT_PUBLIC_SUPABASE_URL="https://PROJECT.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
npm run build:pages
```

Результат появляется в `out`. Существующая серверная сборка проверяется отдельно:

```powershell
npm run build
```

## Вход на GitHub Pages

Статический сайт не вызывает `/api/auth/login`. Вход выполняется напрямую через
Supabase Auth:

1. браузер очищает локальную Supabase-сессию перед новой попыткой входа;
2. введённый email используется как Supabase Auth email;
3. введённый внутренний `login` сначала резолвится в
   `AccessUser.authEmail` через узкий anonymous RPC;
4. после `signInWithPassword` профиль заново читается по `auth.uid()`.

Для входа по внутреннему `login` примените в Supabase отдельный SQL:

```text
supabase/prelogin-auth-lookup.sql
```

Если этот SQL не применён, на GitHub Pages используйте вход по реальному
`AccessUser.authEmail`.
