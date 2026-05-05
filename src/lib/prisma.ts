import { PrismaPg } from "@prisma/adapter-pg";
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

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

export function getPrismaClient() {
  if (!globalForPrisma.dutyRpPrisma) {
    globalForPrisma.dutyRpPrisma = createPrismaClient();
  }

  return globalForPrisma.dutyRpPrisma;
}
