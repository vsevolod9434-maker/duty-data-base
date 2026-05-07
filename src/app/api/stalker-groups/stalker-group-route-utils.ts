import type { StalkerGroupRoleType, StalkerGroupStatus } from "@/lib/types";

const stalkerGroupStatuses = ["active", "archive"] as const satisfies readonly StalkerGroupStatus[];
const stalkerGroupRoleTypes = ["leader", "member", "custom"] as const satisfies readonly StalkerGroupRoleType[];

export type StalkerGroupMemberPayload = {
  id?: unknown;
  stalkerId?: unknown;
  roleType?: unknown;
  customRoleName?: unknown;
  joinedAt?: unknown;
};

export type StalkerGroupPayload = {
  id?: unknown;
  name?: unknown;
  photoUrl?: unknown;
  status?: unknown;
  notes?: unknown;
  members?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type DatabaseGroup = {
  id: string;
  name: string;
  photoUrl: string | null;
  status: StalkerGroupStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    id: string;
    stalkerId: string;
    roleType: StalkerGroupRoleType;
    customRoleName: string | null;
    joinedAt: Date;
  }>;
};

export const groupResponseInclude = {
  members: {
    orderBy: { joinedAt: "asc" },
    select: {
      id: true,
      stalkerId: true,
      roleType: true,
      customRoleName: true,
      joinedAt: true,
    },
  },
} as const;

export function createErrorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isStalkerGroupStatus(value: unknown): value is StalkerGroupStatus {
  return typeof value === "string" && stalkerGroupStatuses.includes(value as StalkerGroupStatus);
}

export function isStalkerGroupRoleType(value: unknown): value is StalkerGroupRoleType {
  return typeof value === "string" && stalkerGroupRoleTypes.includes(value as StalkerGroupRoleType);
}

export function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue || null;
}

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function parseStoredDate(value: unknown, fallback: Date) {
  const parsedDate = parseNullableDate(value);
  return parsedDate ?? fallback;
}

export function mapGroupToResponse(group: DatabaseGroup) {
  return {
    id: group.id,
    name: group.name,
    photoUrl: group.photoUrl,
    status: group.status,
    notes: group.notes,
    members: group.members.map((member) => ({
      id: member.id,
      stalkerId: member.stalkerId,
      roleType: member.roleType,
      customRoleName: member.customRoleName,
      joinedAt: member.joinedAt.toISOString(),
    })),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export function normalizeMemberPayloads(
  value: unknown,
  existingStalkerIds: Set<string>,
  fallbackDate: Date,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenStalkerIds = new Set<string>();
  return value.flatMap((member): Array<{
    id: string;
    stalkerId: string;
    roleType: StalkerGroupRoleType;
    customRoleName: string | null;
    joinedAt: Date;
  }> => {
    if (!member || typeof member !== "object") {
      return [];
    }

    const candidate = member as StalkerGroupMemberPayload;
    const stalkerId = normalizeString(candidate.stalkerId);

    if (!stalkerId || !existingStalkerIds.has(stalkerId) || seenStalkerIds.has(stalkerId)) {
      return [];
    }

    seenStalkerIds.add(stalkerId);

    const roleType = isStalkerGroupRoleType(candidate.roleType) ? candidate.roleType : "member";
    const customRoleName = roleType === "custom" ? normalizeNullableString(candidate.customRoleName) : null;

    return [
      {
        id: normalizeString(candidate.id) || crypto.randomUUID(),
        stalkerId,
        roleType,
        customRoleName,
        joinedAt: parseStoredDate(candidate.joinedAt, fallbackDate),
      },
    ];
  });
}
