# Авторизация

Сайт закрыт через Supabase Auth. Публичной регистрации нет: пользователей создаёт администратор вручную.

## Создание пользователя Supabase Auth

1. Откройте Supabase Dashboard.
2. Перейдите в `Authentication -> Users -> Add user`.
3. Создайте пользователя с техническим email и паролем.

## Auth User ID

1. В Supabase Dashboard откройте `Authentication -> Users`.
2. Откройте созданного пользователя.
3. Скопируйте `ID` пользователя.

## Создание внутреннего логина

После создания пользователя Supabase Auth свяжите его с кириллическим логином:

```bash
npx tsx scripts/create-access-user.ts --auth-user-id "UUID_ИЗ_SUPABASE_AUTH" --auth-email "admin@duty.local" --login "Администратор" --display-name "Системный администратор" --role system_admin
```

Скрипт не создаёт Supabase Auth пользователя. Он создаёт или обновляет запись `AccessUser` в базе проекта.

## Вход

На странице `/login` пользователь вводит внутренний логин и пароль пользователя Supabase Auth.

Пример:

```text
Логин: Администратор
Пароль: пароль пользователя из Supabase Auth
```
