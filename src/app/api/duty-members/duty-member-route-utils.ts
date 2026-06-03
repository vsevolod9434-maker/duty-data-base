import type { AccessUserRole, DutyMemberProfileStatus, DutyServiceStatus } from "@/generated/prisma/client";
import { getRoleLabel, type UserRole } from "@/lib/auth-roles";
import { getDutyAccessLevelLabel, isDutyMemberVisibleRole } from "@/lib/duty-members";
import { canonicalDutyStaffPositionIds } from "@/lib/duty-staff-list";
import { normalizeLogin } from "@/lib/auth-login";

export const dutyMemberInclude = {
  accessUser: {
    select: {
      displayName: true,
      id: true,
      isActive: true,
      login: true,
      role: true,
    },
  },
  staffPositions: {
    where: {
      id: { in: canonicalDutyStaffPositionIds },
    },
    include: {
      section: {
        select: {
          id: true,
          name: true,
          sortOrder: true,
        },
      },
    },
    orderBy: [{ section: { sortOrder: "asc" as const } }, { sortOrder: "asc" as const }],
  },
};

const serviceStatuses = new Set<DutyServiceStatus>(["active", "leave", "wounded", "missing", "discharged"]);
const profileStatuses = new Set<DutyMemberProfileStatus>(["active", "archived"]);

export type DutyMemberPayload = {
  accessLogin?: unknown;
  callsign?: unknown;
  fullName?: unknown;
  notes?: unknown;
  photoUrl?: unknown;
  position?: unknown;
  profileStatus?: unknown;
  rank?: unknown;
  serviceStatus?: unknown;
  unit?: unknown;
};

type AccessUserPreview = {
  displayName: string | null;
  id: string;
  isActive: boolean;
  login: string;
  role: AccessUserRole;
} | null;

type DutyMemberRecord = {
  accessUser: AccessUserPreview;
  accessUserId: string | null;
  callsign: string | null;
  createdAt: Date;
  fullName: string;
  id: string;
  notes: string | null;
  photoUrl: string | null;
  position: string | null;
  profileStatus: DutyMemberProfileStatus;
  rank: string | null;
  serviceStatus: DutyServiceStatus;
  unit: string | null;
  updatedAt: Date;
  staffPositions: Array<{
    id: string;
    title: string;
    sortOrder: number;
    section: {
      id: string;
      name: string;
      sortOrder: number;
    };
  }>;
};

export function createDutyMemberErrorResponse(message: string, status = 400) {
  return Response.json({ message }, { status });
}

export function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeRequiredString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function isDutyServiceStatus(value: unknown): value is DutyServiceStatus {
  return typeof value === "string" && serviceStatuses.has(value as DutyServiceStatus);
}

export function isDutyMemberProfileStatus(value: unknown): value is DutyMemberProfileStatus {
  return typeof value === "string" && profileStatuses.has(value as DutyMemberProfileStatus);
}

export function isDutyMemberExcluded(serviceStatus: DutyServiceStatus) {
  return serviceStatus === "discharged";
}

export function isHiddenDutyMemberRole(role: AccessUserRole | null | undefined) {
  return role ? !isDutyMemberVisibleRole(role as UserRole) : false;
}

export function mapDutyMemberToResponse(member: DutyMemberRecord) {
  return {
    id: member.id,
    fullName: member.fullName,
    callsign: member.callsign,
    rank: member.rank,
    position: member.position,
    unit: member.unit,
    serviceStatus: member.serviceStatus,
    profileStatus: member.profileStatus,
    notes: member.notes,
    photoUrl: member.photoUrl,
    positions: member.staffPositions.map((position) => ({
      id: position.id,
      title: position.title,
      sectionId: position.section.id,
      sectionName: position.section.name,
      sortOrder: position.sortOrder,
    })),
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    access: member.accessUser
      ? {
          login: member.accessUser.login,
          displayName: member.accessUser.displayName,
          role: member.accessUser.role,
          roleLabel: getRoleLabel(member.accessUser.role as UserRole),
          accessLevelLabel: getDutyAccessLevelLabel(member.accessUser.role as UserRole),
          isActive: isDutyMemberExcluded(member.serviceStatus) ? false : member.accessUser.isActive,
        }
      : null,
  };
}

export function buildDutyMemberData(payload: DutyMemberPayload) {
  const fullName = normalizeRequiredString(payload.fullName);
  const callsign = normalizeNullableString(payload.callsign);
  const serviceStatus = isDutyServiceStatus(payload.serviceStatus) ? payload.serviceStatus : "active";
  const profileStatus = isDutyMemberProfileStatus(payload.profileStatus) ? payload.profileStatus : "active";

  if (!fullName && !normalizeAccessLogin(payload.accessLogin)) {
    return { ok: false as const, error: "Выберите учётную запись доступа." };
  }

  return {
    ok: true as const,
    value: {
      fullName,
      callSign: callsign,
      callsign,
      rank: normalizeNullableString(payload.rank),
      position: normalizeNullableString(payload.position),
      unit: normalizeNullableString(payload.unit),
      photoUrl: normalizeNullableString(payload.photoUrl),
      serviceStatus,
      profileStatus,
      notes: normalizeNullableString(payload.notes),
    },
  };
}

export function normalizeAccessLogin(value: unknown) {
  const login = normalizeNullableString(value);
  return login ? normalizeLogin(login) : null;
}

export function canManageDutyAccess(
  actor: { id: string; role: AccessUserRole },
  target: { id: string; role: AccessUserRole } | null,
) {
  if (actor.role !== "system_admin" && actor.role !== "officer") {
    return { ok: false as const, message: "Доступ к операции запрещён." };
  }

  if (!target) {
    return { ok: false as const, message: "Профиль не связан со служебным доступом." };
  }

  if (actor.id === target.id) {
    return { ok: false as const, message: "Нельзя выполнить действие над собственным профилем." };
  }

  if (actor.role === "officer" && target.role === "system_admin") {
    return { ok: false as const, message: "Доступ к операции запрещён." };
  }

  return { ok: true as const };
}

export function canDeleteDutyMember(
  actor: { id: string; role: AccessUserRole },
  target: { id: string; role: AccessUserRole } | null,
) {
  if (actor.role !== "system_admin" && actor.role !== "officer") {
    return { ok: false as const, message: "Доступ к операции запрещён." };
  }

  if (target?.id === actor.id) {
    return { ok: false as const, message: "Нельзя выполнить действие над собственным профилем." };
  }

  if (actor.role === "officer" && target?.role === "system_admin") {
    return { ok: false as const, message: "Доступ к операции запрещён." };
  }

  return { ok: true as const };
}
