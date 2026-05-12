import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  collectMemberStalkerIds,
  createErrorResponse,
  groupResponseInclude,
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

function isNotFoundError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

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

  const prisma = getPrismaClient();
  let normalizedMembers:
    | Array<{
        id: string;
        stalkerId: string;
        roleType: "leader" | "member" | "custom";
        customRoleName: string | null;
        joinedAt: Date;
      }>
    | undefined;

  if (payload.members !== undefined) {
    const requestedStalkerIds = collectMemberStalkerIds(payload.members);
    const existingStalkerIds = new Set<string>();

    if (requestedStalkerIds.length > 0) {
      const stalkers = await prisma.stalker.findMany({
        where: { id: { in: requestedStalkerIds } },
        select: { id: true },
      });

      stalkers.forEach((stalker) => {
        existingStalkerIds.add(stalker.id);
      });

      if (existingStalkerIds.size !== requestedStalkerIds.length) {
        return createErrorResponse("Один или несколько сталкеров не найдены.", 404);
      }
    }

    normalizedMembers = normalizeMemberPayloads(payload.members, existingStalkerIds, data.updatedAt);
  }

  try {
    const group = await prisma.$transaction(async (tx) => {
      const updatedGroup = await tx.stalkerGroup.update({
        data,
        where: { id },
      });

      if (normalizedMembers !== undefined) {
        await tx.stalkerGroupMember.deleteMany({
          where: { groupId: updatedGroup.id },
        });

        if (normalizedMembers.length > 0) {
          await tx.stalkerGroupMember.createMany({
            data: normalizedMembers.map((member) => ({
              ...member,
              groupId: updatedGroup.id,
            })),
          });
        }
      }

      return tx.stalkerGroup.findUniqueOrThrow({
        include: groupResponseInclude,
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
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

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
