import { requireApiAuth } from "@/lib/auth/require-api-auth";
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
  type TaskPayload,
} from "../task-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isNotFoundError(error: unknown) {
  return error !== null && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2025";
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
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

  try {
    const prisma = getPrismaClient();
    const currentTask = await prisma.task.findUniqueOrThrow({ where: { id } });
    const data: {
      assigneeType?: "stalker" | "group" | "manual";
      stalkerId?: string | null;
      groupId?: string | null;
      manualAssigneeName?: string | null;
      issuedAt?: Date;
      dueAt?: Date | null;
      description?: string;
      reward?: string | null;
      notes?: string | null;
      issuedBy?: string | null;
      acceptedBy?: string | null;
      completedAt?: Date | null;
      status?: "active" | "completed" | "cancelled";
      updatedAt: Date;
    } = {
      updatedAt: createSystemDate(),
    };

    if (
      payload.assigneeType !== undefined ||
      payload.stalkerId !== undefined ||
      payload.groupId !== undefined ||
      payload.manualAssigneeName !== undefined
    ) {
      const [stalkers, groups] = await Promise.all([
        prisma.stalker.findMany({ select: { affiliation: true, id: true } }),
        prisma.stalkerGroup.findMany({
          select: {
            id: true,
            members: {
              select: {
                stalker: {
                  select: { affiliation: true },
                },
              },
            },
          },
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
      const assignee = normalizeTaskAssignee(
        {
          assigneeType: payload.assigneeType ?? currentTask.assigneeType,
          stalkerId: payload.stalkerId ?? currentTask.stalkerId,
          groupId: payload.groupId ?? currentTask.groupId,
          manualAssigneeName: payload.manualAssigneeName ?? currentTask.manualAssigneeName,
        },
        existingStalkerIds,
        existingGroupIds,
      );

      if (assignee.assigneeType === "stalker" && dutyStalkerIds.has(assignee.stalkerId)) {
        return createErrorResponse("Задания членам «Долга» не выдаются.");
      }

      if (assignee.assigneeType === "group" && groupsWithDutyMembers.has(assignee.groupId)) {
        return createErrorResponse("Задание нельзя выдать группе, в составе которой есть член «Долга».");
      }

      data.assigneeType = assignee.assigneeType;
      data.stalkerId = assignee.stalkerId;
      data.groupId = assignee.groupId;
      data.manualAssigneeName = assignee.manualAssigneeName;
    }

    if (payload.issuedAt !== undefined) {
      const issuedAt = parseNullableDate(payload.issuedAt);

      if (!issuedAt) {
        return createErrorResponse("Укажите дату выдачи задания.");
      }

      data.issuedAt = issuedAt;
    }

    if (payload.dueAt !== undefined) {
      data.dueAt = parseNullableDate(payload.dueAt);
    }

    if (payload.description !== undefined) {
      const description = normalizeString(payload.description);

      if (!description) {
        return createErrorResponse("Укажите описание задания.");
      }

      data.description = description;
    }

    if (payload.reward !== undefined) {
      data.reward = normalizeNullableString(payload.reward);
    }

    if (payload.notes !== undefined) {
      data.notes = normalizeNullableString(payload.notes);
    }

    if (payload.issuedBy !== undefined) {
      data.issuedBy = normalizeNullableString(payload.issuedBy);
    }

    if (payload.acceptedBy !== undefined) {
      data.acceptedBy = normalizeNullableString(payload.acceptedBy);
    }

    if (payload.completedAt !== undefined) {
      data.completedAt = parseNullableDate(payload.completedAt);
    }

    if (isTaskStatus(payload.status)) {
      data.status = payload.status;
    }

    const task = await prisma.task.update({
      data,
      where: { id },
    });

    return Response.json(mapTaskToResponse(task));
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Задание не найдено.", 404);
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    await prisma.task.delete({ where: { id } });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Задание не найдено.", 404);
    }

    throw error;
  }
}
