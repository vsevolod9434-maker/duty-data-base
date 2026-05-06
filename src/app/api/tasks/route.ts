import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createErrorResponse,
  isTaskAssigneeType,
  isTaskStatus,
  mapTaskToResponse,
  normalizeNullableString,
  normalizeString,
  normalizeTaskAssignee,
  parseNullableDate,
  parseStoredDate,
  type TaskPayload,
} from "./task-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const prisma = getPrismaClient();
  const tasks = await prisma.task.findMany({
    orderBy: { issuedAt: "desc" },
  });

  return Response.json(tasks.map(mapTaskToResponse));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as TaskPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные задания.");
  }

  if (payload.assigneeType !== undefined && !isTaskAssigneeType(payload.assigneeType)) {
    return createErrorResponse("Указан некорректный тип исполнителя.");
  }

  if (payload.status !== undefined && !isTaskStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус задания.");
  }

  const description = normalizeString(payload.description);

  if (!description) {
    return createErrorResponse("Укажите описание задания.");
  }

  const prisma = getPrismaClient();
  const [stalkers, groups] = await Promise.all([
    prisma.stalker.findMany({ select: { affiliation: true, id: true } }),
    prisma.stalkerGroup.findMany({
      include: { members: { include: { stalker: { select: { affiliation: true } } } } },
    }),
  ]);
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
  const dutyStalkerIds = new Set(stalkers.filter((stalker) => stalker.affiliation === "duty").map((stalker) => stalker.id));
  const existingGroupIds = new Set(groups.map((group) => group.id));
  const groupsWithDutyMembers = new Set(
    groups
      .filter((group) => group.members.some((member) => member.stalker.affiliation === "duty"))
      .map((group) => group.id),
  );
  const assignee = normalizeTaskAssignee(payload, existingStalkerIds, existingGroupIds);

  if (assignee.assigneeType === "stalker" && dutyStalkerIds.has(assignee.stalkerId)) {
    return createErrorResponse("Задания членам «Долга» не выдаются.");
  }

  if (assignee.assigneeType === "group" && groupsWithDutyMembers.has(assignee.groupId)) {
    return createErrorResponse("Задание нельзя выдать группе, в составе которой есть член «Долга».");
  }

  const now = createSystemDate();
  const task = await prisma.task.create({
    data: {
      id: crypto.randomUUID(),
      assigneeType: assignee.assigneeType,
      stalkerId: assignee.stalkerId,
      groupId: assignee.groupId,
      manualAssigneeName: assignee.manualAssigneeName,
      issuedAt: parseStoredDate(payload.issuedAt, now),
      dueAt: parseNullableDate(payload.dueAt),
      description,
      reward: normalizeNullableString(payload.reward),
      notes: normalizeNullableString(payload.notes),
      issuedBy: normalizeNullableString(payload.issuedBy),
      acceptedBy: normalizeNullableString(payload.acceptedBy),
      completedAt: parseNullableDate(payload.completedAt),
      status: isTaskStatus(payload.status) ? payload.status : "active",
      createdAt: now,
      updatedAt: now,
    },
  });

  return Response.json(mapTaskToResponse(task), { status: 201 });
}
