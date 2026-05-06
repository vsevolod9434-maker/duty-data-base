import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeLogin, validateLogin } from "../src/lib/auth-login";
import { userRoles, type UserRole } from "../src/lib/auth-roles";

type CliOptions = {
  authUserId?: string;
  authEmail?: string;
  login?: string;
  displayName?: string;
  role?: UserRole;
};

function parseArgs(args: string[]) {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Переданы некорректные параметры запуска.");
    }

    if (key === "--auth-user-id") {
      options.authUserId = value;
    } else if (key === "--auth-email") {
      options.authEmail = value;
    } else if (key === "--login") {
      options.login = value;
    } else if (key === "--display-name") {
      options.displayName = value;
    } else if (key === "--role") {
      options.role = value as UserRole;
    } else {
      throw new Error(`Неизвестный параметр: ${key}`);
    }
  }

  return options;
}

function normalizeConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return url.toString();
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL не задан.");
  }

  const poolConfig: PoolConfig = {
    connectionString: normalizeConnectionString(connectionString),
    ssl: {
      rejectUnauthorized: false,
    },
  };

  return new PrismaClient({
    adapter: new PrismaPg(poolConfig),
  });
}

function assertOptions(options: CliOptions) {
  if (!options.authUserId) {
    throw new Error("Укажите --auth-user-id.");
  }

  if (!options.authEmail || !options.authEmail.includes("@")) {
    throw new Error("Укажите корректный --auth-email.");
  }

  if (!options.login) {
    throw new Error("Укажите --login.");
  }

  const loginValidation = validateLogin(options.login);

  if (!loginValidation.ok) {
    throw new Error(loginValidation.error);
  }

  const roleValues = new Set(userRoles.map((role) => role.value));

  if (!options.role || !roleValues.has(options.role)) {
    throw new Error("Укажите корректную роль: system_admin, officer, manager или regular.");
  }

  return {
    authUserId: options.authUserId,
    authEmail: options.authEmail,
    login: options.login.trim(),
    normalizedLogin: normalizeLogin(options.login),
    displayName: options.displayName?.trim() || null,
    role: options.role,
  };
}

async function main() {
  const options = assertOptions(parseArgs(process.argv.slice(2)));
  const prisma = createPrismaClient();

  try {
    const existingUser = await prisma.accessUser.findFirst({
      where: {
        OR: [{ authUserId: options.authUserId }, { authEmail: options.authEmail }],
      },
    });

    if (existingUser) {
      await prisma.accessUser.update({
        data: options,
        where: { id: existingUser.id },
      });
    } else {
      await prisma.accessUser.create({
        data: options,
      });
    }

    console.log("Профиль доступа создан или обновлён.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Не удалось создать профиль доступа.");
  process.exit(1);
});
