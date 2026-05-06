import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createErrorResponse,
  isTaskStatus,
  mapTaskToResponse,
  normalizeNullableString,
  normalizeString,
  normalizeTaskAssignee,
  parseNullableDate,
  parseStoredDate,
  type TaskPayload,
} from "../task-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as unknown;

  if (!Array.isArray(payload)) {
    return createErrorResponse("Для импорта передан не список заданий.");
  }

  const prisma = getPrismaClient();
  const [stalkers, groups] = await Promise.all([
    prisma.stalker.findMany({ select: { id: true } }),
    prisma.stalkerGroup.findMany({ select: { id: true } }),
  ]);
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
  const existingGroupIds = new Set(groups.map((group) => group.id));
  const now = createSystemDate();
  let skippedLinks = 0;

  const candidates = payload
    .filter((item): item is TaskPayload & { id: string } => {
      return Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string";
    })
    .map((task) => {
      const description = normalizeString(task.description);

      if (!description) {
        return null;
      }

      const assignee = normalizeTaskAssignee(task, existingStalkerIds, existingGroupIds);

      if (assignee.skippedLink) {
        skippedLinks += 1;
      }

      const createdAt = parseStoredDate(task.createdAt, now);
      const updatedAt = parseStoredDate(task.updatedAt, createdAt);

      return {
        id: task.id,
        assigneeType: assignee.assigneeType,
        stalkerId: assignee.stalkerId,
        groupId: assignee.groupId,
        manualAssigneeName: assignee.manualAssigneeName,
        issuedAt: parseStoredDate(task.issuedAt, createdAt),
        dueAt: parseNullableDate(task.dueAt),
        description,
        reward: normalizeNullableString(task.reward),
        notes: normalizeNullableString(task.notes),
        issuedBy: normalizeNullableString(task.issuedBy),
        acceptedBy: normalizeNullableString(task.acceptedBy),
        completedAt: parseNullableDate(task.completedAt),
        status: isTaskStatus(task.status) ? task.status : "active",
        createdAt,
        updatedAt,
      };
    })
    .filter((task): task is NonNullable<typeof task> => Boolean(task));

  if (candidates.length === 0) {
    return createErrorResponse("В переданном списке нет заданий, пригодных для импорта.");
  }

  await prisma.$transaction(
    candidates.map((task) =>
      prisma.task.upsert({
        create: task,
        update: {
          assigneeType: task.assigneeType,
          stalkerId: task.stalkerId,
          groupId: task.groupId,
          manualAssigneeName: task.manualAssigneeName,
          issuedAt: task.issuedAt,
          dueAt: task.dueAt,
          description: task.description,
          reward: task.reward,
          notes: task.notes,
          issuedBy: task.issuedBy,
          acceptedBy: task.acceptedBy,
          completedAt: task.completedAt,
          status: task.status,
          updatedAt: task.updatedAt,
        },
        where: { id: task.id },
      }),
    ),
  );

  const tasks = await prisma.task.findMany({
    orderBy: { issuedAt: "desc" },
  });

  return Response.json({
    tasks: tasks.map(mapTaskToResponse),
    skippedLinks,
  });
}
