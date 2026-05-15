import { getRoleLabel, type UserRole } from "@/lib/auth-roles";

export const staffListInclude = {
  positions: {
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
      member: position.dutyMember?.accessUser
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
