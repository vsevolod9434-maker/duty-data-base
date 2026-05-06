import type { TaskAssigneeType, TaskStatus } from "@/lib/types";

const taskAssigneeTypes = ["stalker", "group", "manual"] as const satisfies readonly TaskAssigneeType[];
const taskStatuses = ["active", "completed", "cancelled"] as const satisfies readonly TaskStatus[];

export type TaskPayload = {
  id?: unknown;
  assigneeType?: unknown;
  stalkerId?: unknown;
  groupId?: unknown;
  manualAssigneeName?: unknown;
  issuedAt?: unknown;
  dueAt?: unknown;
  description?: unknown;
  reward?: unknown;
  notes?: unknown;
  issuedBy?: unknown;
  acceptedBy?: unknown;
  completedAt?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type DatabaseTask = {
  id: string;
  assigneeType: TaskAssigneeType;
  stalkerId: string | null;
  groupId: string | null;
  manualAssigneeName: string | null;
  issuedAt: Date;
  dueAt: Date | null;
  description: string;
  reward: string | null;
  notes: string | null;
  issuedBy: string | null;
  acceptedBy: string | null;
  completedAt: Date | null;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
};

export function createErrorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isTaskAssigneeType(value: unknown): value is TaskAssigneeType {
  return typeof value === "string" && taskAssigneeTypes.includes(value as TaskAssigneeType);
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && taskStatuses.includes(value as TaskStatus);
}

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNullableString(value: unknown) {
  const normalizedValue = normalizeString(value);
  return normalizedValue || null;
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

export function mapTaskToResponse(task: DatabaseTask) {
  return {
    id: task.id,
    assigneeType: task.assigneeType,
    stalkerId: task.stalkerId,
    groupId: task.groupId,
    manualAssigneeName: task.manualAssigneeName,
    issuedAt: task.issuedAt.toISOString(),
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    description: task.description,
    reward: task.reward,
    notes: task.notes,
    issuedBy: task.issuedBy,
    acceptedBy: task.acceptedBy,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function normalizeTaskAssignee(
  payload: TaskPayload,
  existingStalkerIds: Set<string>,
  existingGroupIds: Set<string>,
) {
  const requestedAssigneeType = isTaskAssigneeType(payload.assigneeType) ? payload.assigneeType : "manual";
  const stalkerId = normalizeString(payload.stalkerId);
  const groupId = normalizeString(payload.groupId);
  const manualAssigneeName = normalizeNullableString(payload.manualAssigneeName);

  if (requestedAssigneeType === "stalker" && stalkerId && existingStalkerIds.has(stalkerId)) {
    return {
      assigneeType: "stalker" as const,
      stalkerId,
      groupId: null,
      manualAssigneeName: null,
      skippedLink: false,
    };
  }

  if (requestedAssigneeType === "group" && groupId && existingGroupIds.has(groupId)) {
    return {
      assigneeType: "group" as const,
      stalkerId: null,
      groupId,
      manualAssigneeName: null,
      skippedLink: false,
    };
  }

  return {
    assigneeType: "manual" as const,
    stalkerId: null,
    groupId: null,
    manualAssigneeName: manualAssigneeName ?? (stalkerId || groupId || null),
    skippedLink: requestedAssigneeType !== "manual",
  };
}
