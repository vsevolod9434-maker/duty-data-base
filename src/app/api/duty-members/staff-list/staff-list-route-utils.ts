import { getRoleLabel, type UserRole } from "@/lib/auth-roles";
import { isDutyMemberVisibleRole } from "@/lib/duty-members";
import { canonicalDutyStaffPositionIds, canonicalDutyStaffSections } from "@/lib/duty-staff-list";

type StaffListPrismaClient = {
  dutyStaffPosition: {
    findMany: (args: {
      select: { dutyMemberId: true; id: true };
      where: { dutyMemberId: { not: null }; id: { in: string[] } };
    }) => Promise<Array<{ dutyMemberId: string | null; id: string }>>;
    updateMany: (args: {
      data: { assignedAt?: null; dutyMemberId?: null; updatedBy: string };
      where: { id: { in: string[] } };
    }) => Promise<unknown>;
    upsert: (args: {
      create: {
        id: string;
        sectionId: string;
        sortOrder: number;
        title: string;
        updatedBy: string;
      };
      update: {
        sectionId: string;
        sortOrder: number;
        title: string;
      };
      where: { id: string };
    }) => Promise<unknown>;
  };
  dutyStaffSection: {
    upsert: (args: {
      create: { id: string; name: string; sortOrder: number };
      update: { name: string; sortOrder: number };
      where: { id: string };
    }) => Promise<unknown>;
  };
  $transaction: <T>(operations: Promise<T>[]) => Promise<T[]>;
};

export const staffListInclude = {
  positions: {
    where: {
      id: { in: canonicalDutyStaffPositionIds },
    },
    include: {
      dutyMember: {
        include: {
          accessUser: {
            select: {
              displayName: true,
              isActive: true,
              login: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
};

export async function ensureDutyStaffList(prisma: StaffListPrismaClient) {
  const operations: Promise<unknown>[] = [];

  for (const section of canonicalDutyStaffSections) {
    operations.push(
      prisma.dutyStaffSection.upsert({
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
      }),
    );

    for (const position of section.positions) {
      operations.push(
        prisma.dutyStaffPosition.upsert({
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
        }),
      );
    }
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  await clearDuplicateDutyStaffAssignments(prisma);
}

async function clearDuplicateDutyStaffAssignments(prisma: StaffListPrismaClient) {
  const assignedPositions = await prisma.dutyStaffPosition.findMany({
    select: {
      dutyMemberId: true,
      id: true,
    },
    where: {
      dutyMemberId: { not: null },
      id: { in: canonicalDutyStaffPositionIds },
    },
  });
  const seenMemberIds = new Set<string>();
  const duplicatePositionIds: string[] = [];

  for (const positionId of canonicalDutyStaffPositionIds) {
    const position = assignedPositions.find((record) => record.id === positionId);

    if (!position?.dutyMemberId) {
      continue;
    }

    if (seenMemberIds.has(position.dutyMemberId)) {
      duplicatePositionIds.push(position.id);
      continue;
    }

    seenMemberIds.add(position.dutyMemberId);
  }

  if (duplicatePositionIds.length > 0) {
    await prisma.dutyStaffPosition.updateMany({
      data: {
        assignedAt: null,
        dutyMemberId: null,
        updatedBy: "Повторное назначение снято",
      },
      where: {
        id: { in: duplicatePositionIds },
      },
    });
  }
}

export function createStaffListErrorResponse(message: string, status = 400) {
  return Response.json({ message }, { status });
}

type StaffSectionRecord = {
  id: string;
  name: string;
  sortOrder: number;
  positions: Array<{
    assignedAt: Date | null;
    assignedBy: string | null;
    dutyMember: {
      accessUser: {
        displayName: string | null;
        isActive: boolean;
        login: string;
        role: string;
      } | null;
      callsign: string | null;
      fullName: string;
      id: string;
      rank: string | null;
      serviceStatus: string;
    } | null;
    dutyMemberId: string | null;
    id: string;
    sortOrder: number;
    title: string;
    updatedBy: string | null;
  }>;
};

export function mapStaffSectionToResponse(section: StaffSectionRecord) {
  return {
    id: section.id,
    name: section.name,
    sortOrder: section.sortOrder,
    positions: section.positions.map((position) => ({
      id: position.id,
      title: position.title,
      sortOrder: position.sortOrder,
      assignedAt: position.assignedAt?.toISOString() ?? null,
      assignedBy: position.assignedBy,
      updatedBy: position.updatedBy,
      member:
        position.dutyMember?.accessUser &&
        isDutyMemberVisibleRole(position.dutyMember.accessUser.role as UserRole)
        ? {
            id: position.dutyMember.id,
            fullName: position.dutyMember.fullName,
            callsign: position.dutyMember.callsign,
            rank: position.dutyMember.rank,
            serviceStatus: position.dutyMember.serviceStatus,
            access: position.dutyMember.accessUser
              ? {
                  login: position.dutyMember.accessUser.login,
                  displayName: position.dutyMember.accessUser.displayName,
                  role: position.dutyMember.accessUser.role,
                  roleLabel: getRoleLabel(position.dutyMember.accessUser.role as UserRole),
                  isActive: position.dutyMember.accessUser.isActive,
                }
              : null,
          }
        : null,
    })),
  };
}
