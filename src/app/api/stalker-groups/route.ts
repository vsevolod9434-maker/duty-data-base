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
} from "./stalker-group-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();
  const groups = await prisma.stalkerGroup.findMany({
    include: groupResponseInclude,
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  });

  return Response.json(groups.map(mapGroupToResponse));
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as StalkerGroupPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные группы.");
  }

  const name = normalizeString(payload.name);

  if (!name) {
    return createErrorResponse("Укажите название группы.");
  }

  if (payload.status !== undefined && !isStalkerGroupStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус группы.");
  }

  const prisma = getPrismaClient();
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

  const now = createSystemDate();
  const members = normalizeMemberPayloads(payload.members, existingStalkerIds, now);

  const group = await prisma.stalkerGroup.create({
    data: {
      id: crypto.randomUUID(),
      name,
      photoUrl: normalizeNullableString(payload.photoUrl),
      status: isStalkerGroupStatus(payload.status) ? payload.status : "active",
      notes: normalizeNullableString(payload.notes),
      createdAt: now,
      updatedAt: now,
      members: {
        create: members,
      },
    },
    include: groupResponseInclude,
  });

  return Response.json(mapGroupToResponse(group), { status: 201 });
}
