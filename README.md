# Внутренняя база учёта группировки «Долг»

Рабочая система учёта профилей сталкеров, групп, квартир, оплат и оперативных журналов.

## Основные команды

```bash
npm run dev
npm run lint
npm run build
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
