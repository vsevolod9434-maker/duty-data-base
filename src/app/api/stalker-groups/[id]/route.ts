import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createErrorResponse,
  isStalkerGroupStatus,
  mapGroupToResponse,
  normalizeMemberPayloads,
  normalizeNullableString,
  normalizeString,
  type StalkerGroupPayload,
} from "../stalker-group-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const groupInclude = {
  members: {
    orderBy: { joinedAt: "asc" },
  },
} as const;

function isNotFoundError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as StalkerGroupPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные группы.");
  }

  if (payload.status !== undefined && !isStalkerGroupStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус группы.");
  }

  const data: {
    name?: string;
    photoUrl?: string | null;
    notes?: string | null;
    status?: "active" | "archive";
    updatedAt: Date;
  } = {
    updatedAt: createSystemDate(),
  };

  if (payload.name !== undefined) {
    const name = normalizeString(payload.name);

    if (!name) {
      return createErrorResponse("Укажите название группы.");
    }

    data.name = name;
  }

  if (payload.photoUrl !== undefined) {
    data.photoUrl = normalizeNullableString(payload.photoUrl);
  }

  if (payload.notes !== undefined) {
    data.notes = normalizeNullableString(payload.notes);
  }

  if (payload.status !== undefined) {
    data.status = payload.status;
  }

  try {
    const prisma = getPrismaClient();
    const group = await prisma.$transaction(async (tx) => {
      const updatedGroup = await tx.stalkerGroup.update({
        data,
        where: { id },
      });

      if (payload.members !== undefined) {
        const stalkers = await tx.stalker.findMany({ select: { id: true } });
        const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
        const members = normalizeMemberPayloads(payload.members, existingStalkerIds, data.updatedAt);

        await tx.stalkerGroupMember.deleteMany({
          where: { groupId: updatedGroup.id },
        });

        if (members.length > 0) {
          await tx.stalkerGroupMember.createMany({
            data: members.map((member) => ({
              ...member,
              groupId: updatedGroup.id,
            })),
          });
        }
      }

      return tx.stalkerGroup.findUniqueOrThrow({
        include: groupInclude,
        where: { id },
      });
    });

    return Response.json(mapGroupToResponse(group));
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Группа не найдена.", 404);
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    await prisma.stalkerGroup.delete({
      where: { id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Группа не найдена.", 404);
    }

    throw error;
  }
}
