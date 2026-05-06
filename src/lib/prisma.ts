import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

type PrismaClientInstance = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as typeof globalThis & {
  dutyRpPrisma?: PrismaClientInstance;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
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

function normalizeConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");

  return url.toString();
}

export function getPrismaClient() {
  if (!globalForPrisma.dutyRpPrisma) {
    globalForPrisma.dutyRpPrisma = createPrismaClient();
  }

  return globalForPrisma.dutyRpPrisma;
}
