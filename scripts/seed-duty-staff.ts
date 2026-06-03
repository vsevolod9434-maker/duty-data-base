import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { canonicalDutyStaffSections } from "../src/lib/duty-staff-list";

function normalizeConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return url.toString();
}

function createPrismaClient() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Строка подключения не задана.");
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

async function main() {
  const prisma = createPrismaClient();

  for (const section of canonicalDutyStaffSections) {
    await prisma.dutyStaffSection.upsert({
      create: {
        id: section.id,
        name: section.name,
        sortOrder: section.sortOrder,
      },
      update: {
        name: section.name,
        sortOrder: section.sortOrder,
      },
      where: { id: section.id },
    });

    for (const position of section.positions) {
      await prisma.dutyStaffPosition.upsert({
        create: {
          id: position.id,
          sectionId: section.id,
          title: position.title,
          sortOrder: position.sortOrder,
          updatedBy: "Система учёта",
        },
        update: {
          sectionId: section.id,
          title: position.title,
          sortOrder: position.sortOrder,
        },
        where: { id: position.id },
      });
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Не удалось заполнить штатный список.");
  process.exit(1);
});
