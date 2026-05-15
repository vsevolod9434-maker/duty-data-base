import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";

type StaffPositionSeed = {
  title: string;
  assignee: string | null;
};

type StaffSectionSeed = {
  id: string;
  name: string;
  positions: StaffPositionSeed[];
};

const staffSections: StaffSectionSeed[] = [
  {
    id: "command",
    name: "Управление",
    positions: [
      {
        title: "Командир отряда специального назначения",
        assignee: "Капитан Семёнов Артём Александрович",
      },
      {
        title: "Заместитель командира отряда специального назначения по воспитательной и политической работе с личным составом",
        assignee: "Лейтенант Смирнов Сергей Сергеевич",
      },
      {
        title: "Старшина отряда специального назначения (начальник службы тыла)",
        assignee: null,
      },
    ],
  },
  {
    id: "combat-training",
    name: "Отдел боевой подготовки отряда специального назначения",
    positions: [
      {
        title: "Начальник отдела (инструктор по боевой подготовке личного состава)",
        assignee: "Лейтенант Смирнов Сергей Сергеевич",
      },
    ],
  },
  {
    id: "special-department",
    name: "Особый отдел отряда специального назначения",
    positions: [
      {
        title: "Начальник особого отдела",
        assignee: "Лейтенант Смирнов Сергей Сергеевич",
      },
      {
        title: "Группа разведки (подв. особ. отд.)",
        assignee: null,
      },
      {
        title: "Группа разведки (подв. особ. отд.)",
        assignee: "Младший лейтенант Чередняк Савелий Алексеевич",
      },
    ],
  },
  {
    id: "rear-service",
    name: "Служба тыла",
    positions: [
      {
        title: "Старшина отряда специального назначения (начальник службы тыла)",
        assignee: null,
      },
      {
        title: "Снабженец службы тыла",
        assignee: null,
      },
      {
        title: "Снабженец службы тыла",
        assignee: null,
      },
    ],
  },
  {
    id: "medical-service",
    name: "Медицинская служба",
    positions: [
      {
        title: "Начальник медицинской службы (военврач/санинструктор)",
        assignee: null,
      },
      {
        title: "Санинструктор",
        assignee: "Ефрейтор Вербицкий Дмитрий Иванович",
      },
    ],
  },
  {
    id: "research-corps",
    name: "Научно-исследовательский корпус",
    positions: [
      {
        title: "Начальник корпуса (ведущий исследователь)",
        assignee: null,
      },
      {
        title: "Специалист",
        assignee: "Ефрейтор Вербицкий Дмитрий Иванович",
      },
    ],
  },
  {
    id: "fighter-platoon",
    name: "Взвод истребителей",
    positions: [
      {
        title: "Командир взвода истребителей",
        assignee: "Младший лейтенант Чередняк Савелий Алексеевич",
      },
      {
        title: "Заместитель командира взвода истребителей",
        assignee: null,
      },
      {
        title: "Старший стрелок взвода истребителей",
        assignee: "Старшина Комаров Александр Романovich",
      },
      {
        title: "Стрелок взвода истребителей",
        assignee: "Ефрейтор Кузнецов Александр Васильевич",
      },
      {
        title: "Стрелок взвода истребителей",
        assignee: null,
      },
      {
        title: "Стрелок взвода истребителей",
        assignee: "Рядовой Журавлев Федор Романович",
      },
      {
        title: "Гранатометчик взвода истребителей",
        assignee: null,
      },
      {
        title: "Снайпер взвода истребителей",
        assignee: "Младший сержант Князев Антон Александрович",
      },
    ],
  },
];

const rankPrefixes = [
  "Младший лейтенант",
  "Младший сержант",
  "Лейтенант",
  "Старшина",
  "Ефрейтор",
  "Рядовой",
  "Капитан",
];

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

function normalizeForMatch(value: string) {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/[^a-zа-я0-9]/gi, "");
}

function parseAssignee(value: string) {
  const rank = rankPrefixes.find((prefix) => value.startsWith(`${prefix} `)) ?? "";
  const fullName = rank ? value.slice(rank.length).trim() : value.trim();

  return { fullName, rank };
}

function createPositionId(sectionId: string, index: number) {
  return `${sectionId}-${String(index + 1).padStart(2, "0")}`;
}

async function main() {
  const prisma = createPrismaClient();
  const now = new Date();
  const accessUsers = await prisma.accessUser
    .findMany({
      include: {
        dutyMember: {
          select: { fullName: true, id: true, rank: true },
        },
      },
    })
    .catch(() => []);

  async function findAssignableMember(assignee: string) {
    const { fullName, rank } = parseAssignee(assignee);
    const existingMember = await prisma.dutyMember.findFirst({
      where: {
        accessUserId: { not: null },
        fullName,
      },
    });

    if (existingMember) {
      if (!existingMember.rank && rank) {
        return prisma.dutyMember.update({
          data: { rank, updatedAt: now },
          where: { id: existingMember.id },
        });
      }

      return existingMember;
    }

    const surname = fullName.split(/\s+/)[0] ?? fullName;
    const normalizedSurname = normalizeForMatch(surname);
    const matchingAccessUsers = accessUsers.filter((user) => {
      const searchable = normalizeForMatch(`${user.displayName ?? ""} ${user.login} ${user.dutyMember?.fullName ?? ""}`);
      return searchable.includes(normalizedSurname) && user.dutyMember;
    });
    const accessUser = matchingAccessUsers.length === 1 ? matchingAccessUsers[0] : null;

    if (accessUser?.dutyMember && !accessUser.dutyMember.rank && rank) {
      return prisma.dutyMember.update({
        data: { rank, updatedAt: now },
        where: { id: accessUser.dutyMember.id },
      });
    }

    return accessUser?.dutyMember ?? null;
  }

  for (const [sectionIndex, section] of staffSections.entries()) {
    await prisma.dutyStaffSection.upsert({
      create: {
        id: section.id,
        name: section.name,
        sortOrder: sectionIndex + 1,
      },
      update: {
        name: section.name,
        sortOrder: sectionIndex + 1,
      },
      where: { id: section.id },
    });

    for (const [positionIndex, position] of section.positions.entries()) {
      const member = position.assignee ? await findAssignableMember(position.assignee) : null;

      await prisma.dutyStaffPosition.upsert({
        create: {
          id: createPositionId(section.id, positionIndex),
          sectionId: section.id,
          title: position.title,
          sortOrder: positionIndex + 1,
          dutyMemberId: member?.id ?? null,
          assignedAt: member ? now : null,
          assignedBy: member ? "Система учёта" : null,
          updatedBy: "Система учёта",
        },
        update: {
          sectionId: section.id,
          title: position.title,
          sortOrder: positionIndex + 1,
          dutyMemberId: member?.id ?? null,
          assignedAt: member ? now : null,
          assignedBy: member ? "Система учёта" : null,
          updatedBy: "Система учёта",
        },
        where: { id: createPositionId(section.id, positionIndex) },
      });
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  if (error && typeof error === "object" && "code" in error) {
    const prismaError = error as { code?: string; meta?: unknown };
    console.error(`${prismaError.code ?? "Ошибка"} ${JSON.stringify(prismaError.meta ?? {})}`);
  } else {
    console.error(error instanceof Error ? error.message : "Не удалось заполнить штатный список.");
  }
  process.exit(1);
});
