import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
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
  const stalkers = await prisma.stalker.findMany({ select: { id: true } });
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
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
