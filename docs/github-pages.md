# Публикация на GitHub Pages

## Адрес

Workflow собирает проект с `basePath`, равным имени репозитория. Для текущего
репозитория адрес публикации:

`https://vsevolod9434-maker.github.io/duty-data-base/`

## Настройка GitHub

1. Откройте `Settings → Pages`.
2. В `Build and deployment` выберите источник `GitHub Actions`.
3. В `Settings → Secrets and variables → Actions` добавьте:
   - `NEXT_PUBLIC_SUPABASE_URL`;
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Если проект Supabase ещё использует старый ключ, можно добавить
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` вместо publishable key.
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

Схема Supabase и RLS этим изменением не менялись. Если подходящих политик сейчас
нет, публикация рабочей базы на GitHub Pages небезопасна и должна считаться
заблокированной до отдельной настройки RLS.

## Функции, которые нельзя безопасно перенести в браузер

Следующие операции оставлены в серверной Vercel-версии и в статическом режиме
возвращают понятную ошибку:

- создание нового пользователя Supabase Auth;
- сброс пароля другого пользователя;
- включение и отключение чужого служебного доступа;
- назначение состава на штатные должности;
- массовый импорт с транзакционной заменой связанных записей;
- автоматическое создание квартир по умолчанию.

Для них нужен защищённый backend: например, Supabase Edge Functions или
отдельный API. В таком backend секретный/service-role key должен храниться
только на сервере. Добавлять его в переменные `NEXT_PUBLIC_*` запрещено.

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
3. введённый внутренний `login` или `displayName` сначала резолвится в
   `AccessUser.authEmail`;
4. после `signInWithPassword` профиль заново читается по `auth.uid()`.

Для входа по внутреннему `login`/`displayName` примените в Supabase отдельный SQL:

```text
supabase/prelogin-auth-lookup.sql
```

Если этот SQL не применён, на GitHub Pages используйте вход по реальному
`AccessUser.authEmail`.
