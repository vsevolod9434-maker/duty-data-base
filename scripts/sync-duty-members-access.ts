import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeLogin } from "../src/lib/auth-login";

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

function normalizeForMatch(value: string | null | undefined) {
  return normalizeLogin(value ?? "").replace(/[^a-zа-я0-9]/gi, "");
}

async function main() {
  const prisma = createPrismaClient();
  const now = new Date();
  let created = 0;
  let linked = 0;
  let updated = 0;

  try {
    const accessUsers = await prisma.accessUser.findMany({
      include: {
        dutyMember: true,
      },
      orderBy: [{ displayName: "asc" }, { login: "asc" }],
    });

    for (const accessUser of accessUsers) {
      if (accessUser.dutyMember) {
        const nextFullName = accessUser.dutyMember.fullName || accessUser.displayName || accessUser.login;
        const nextCallsign = accessUser.dutyMember.callsign || accessUser.login;

        if (nextFullName !== accessUser.dutyMember.fullName || nextCallsign !== accessUser.dutyMember.callsign) {
          await prisma.dutyMember.update({
            data: {
              callSign: nextCallsign,
              callsign: nextCallsign,
              fullName: nextFullName,
              updatedAt: now,
            },
            where: { id: accessUser.dutyMember.id },
          });
          updated += 1;
        }

        continue;
      }

      const accessNameKeys = new Set(
        [accessUser.displayName, accessUser.login].map(normalizeForMatch).filter(Boolean),
      );
      const orphanMembers = await prisma.dutyMember.findMany({
        where: {
          accessUserId: null,
          OR: [
            { fullName: { in: [accessUser.displayName, accessUser.login].filter((value): value is string => Boolean(value)) } },
            { callsign: accessUser.login },
            { callSign: accessUser.login },
          ],
        },
      });
      const matchingOrphans = orphanMembers.filter((member) => {
        const memberKeys = [member.fullName, member.callsign, member.callSign].map(normalizeForMatch);
        return memberKeys.some((key) => key && accessNameKeys.has(key));
      });
      const matchingOrphan = matchingOrphans.length === 1 ? matchingOrphans[0] : null;

      if (matchingOrphan) {
        await prisma.dutyMember.update({
          data: {
            accessUserId: accessUser.id,
            callSign: matchingOrphan.callSign || matchingOrphan.callsign || accessUser.login,
            callsign: matchingOrphan.callsign || matchingOrphan.callSign || accessUser.login,
            fullName: matchingOrphan.fullName || accessUser.displayName || accessUser.login,
            profileStatus: "active",
            serviceStatus: matchingOrphan.serviceStatus === "discharged" ? "active" : matchingOrphan.serviceStatus,
            updatedAt: now,
          },
          where: { id: matchingOrphan.id },
        });
        linked += 1;
        continue;
      }

      await prisma.dutyMember.create({
        data: {
          id: crypto.randomUUID(),
          accessUserId: accessUser.id,
          callSign: accessUser.login,
          callsign: accessUser.login,
          createdAt: now,
          fullName: accessUser.displayName || accessUser.login,
          notes: null,
          position: null,
          profileStatus: "active",
          rank: null,
          serviceStatus: "active",
          unit: null,
          updatedAt: now,
        },
      });
      created += 1;
    }

    const orphanIds = (
      await prisma.dutyMember.findMany({
        select: { id: true },
        where: { accessUserId: null },
      })
    ).map((member) => member.id);

    let releasedPositions = 0;
    let archivedOrphans = 0;

    if (orphanIds.length > 0) {
      const releaseResult = await prisma.dutyStaffPosition.updateMany({
        data: {
          assignedAt: null,
          dutyMemberId: null,
          updatedAt: now,
        },
        where: { dutyMemberId: { in: orphanIds } },
      });
      releasedPositions = releaseResult.count;

      const archiveResult = await prisma.dutyMember.updateMany({
        data: {
          profileStatus: "archived",
          serviceStatus: "discharged",
          updatedAt: now,
        },
        where: {
          id: { in: orphanIds },
          NOT: {
            profileStatus: "archived",
            serviceStatus: "discharged",
          },
        },
      });
      archivedOrphans = archiveResult.count;
    }

    console.log(
      [
        `Создано профилей: ${created}`,
        `Связано существующих профилей: ${linked}`,
        `Обновлено профилей: ${updated}`,
        `Освобождено должностей: ${releasedPositions}`,
        `Архивировано профилей без доступа: ${archivedOrphans}`,
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Не удалось синхронизировать состав с доступом.");
  process.exit(1);
});
