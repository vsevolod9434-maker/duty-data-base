# Внутренняя база учёта группировки «Долг»

Рабочая система учёта профилей сталкеров, групп, квартир, оплат и оперативных журналов.

## Основные команды

```bash
npm run dev
npm run lint
npm test
npm run build
npm run build:pages
npx prisma validate
npx prisma generate
```

Миграции запускать только отдельной осознанной командой. Не использовать `prisma migrate reset`, `prisma db push`, `npm audit fix` или `npm audit fix --force` без отдельного решения.

## Доступ

Интерфейс закрыт авторизацией. Пользователи создаются вручную в панели управления провайдера авторизации, затем связываются с внутренним логином через:

```bash
npm run access-user:create -- --auth-user-id "UUID" --auth-email "admin@duty.local" --login "Администратор" --display-name "Системный администратор" --role system_admin
```

Подробная инструкция находится в [docs/auth.md](docs/auth.md).

## GitHub Pages

Статическая сборка публикуется workflow
`.github/workflows/deploy-pages.yml` по адресу:

`https://vsevolod9434-maker.github.io/duty-data-base/`

Текущий Supabase URL, publishable key и URL Edge Function зафиксированы прямо в
workflow. Это допустимо: publishable key является публичным браузерным ключом.
`service_role`, пароль БД и Supabase access token в Pages-сборку не передаются.

При переносе на новый Supabase-проект необходимо одновременно обновить:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- `NEXT_PUBLIC_ACCESS_ADMIN_FUNCTION_URL`;
- `SUPABASE_PROJECT_ID` в `.github/workflows/deploy-supabase-functions.yml`.

### Чистое развёртывание Supabase

После Prisma-миграций применяются актуальные SQL-файлы безопасности и RPC:

1. `supabase/remove-access-user-password.sql`;
2. `supabase/harden-access-user-identity.sql`;
3. `supabase/prelogin-auth-lookup.sql`;
4. `supabase/rls-policies.sql`;
5. `supabase/access-admin-rpc.sql`;
6. `supabase/static-pages-rpc.sql`;
7. при необходимости `supabase/repair-service-role-access-admin-grants.sql`.

После этого разворачивается Edge Function `access-admin`. Штатные секции и
должности создаются командой `npm run duty-staff:seed`. Каталог снабжения не
заполняется автоматически.

Подробности совместимости, доступных операций и требований к Supabase RLS
описаны в [docs/github-pages.md](docs/github-pages.md).
