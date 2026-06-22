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

Перед первой публикацией добавьте в GitHub Actions Secrets:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Для старых проектов вместо publishable key поддерживается
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Подробности совместимости, ограничения серверных операций и требования к
Supabase RLS описаны в [docs/github-pages.md](docs/github-pages.md).
