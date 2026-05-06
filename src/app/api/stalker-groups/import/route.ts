import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createErrorResponse,
  isStalkerGroupStatus,
  mapGroupToResponse,
  normalizeMemberPayloads,
  normalizeNullableString,
  normalizeString,
  parseStoredDate,
  type StalkerGroupPayload,
} from "../stalker-group-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const groupInclude = {
  members: {
    orderBy: { joinedAt: "asc" },
  },
} as const;

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as unknown;

  if (!Array.isArray(payload)) {
    return createErrorResponse("Для импорта передан не список групп.");
  }

  const prisma = getPrismaClient();
  const stalkers = await prisma.stalker.findMany({ select: { id: true } });
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
  const now = createSystemDate();
  let skippedMembers = 0;

  const candidates = payload
    .filter((item): item is StalkerGroupPayload & { id: string } => {
      return Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string";
    })
    .map((group) => {
      const createdAt = parseStoredDate(group.createdAt, now);
      const updatedAt = parseStoredDate(group.updatedAt, createdAt);
      const rawMemberCount = Array.isArray(group.members) ? group.members.length : 0;
      const members = normalizeMemberPayloads(group.members, existingStalkerIds, updatedAt);
      skippedMembers += rawMemberCount - members.length;

      return {
        id: group.id,
        name: normalizeString(group.name),
        photoUrl: normalizeNullableString(group.photoUrl),
        status: isStalkerGroupStatus(group.status) ? group.status : "active",
        notes: normalizeNullableString(group.notes),
        createdAt,
        updatedAt,
        members,
      };
    })
    .filter((group) => group.name);

  if (candidates.length === 0) {
    return createErrorResponse("В переданном списке нет групп, пригодных для импорта.");
  }

  await prisma.$transaction(
    candidates.flatMap((group) => [
      prisma.stalkerGroup.upsert({
        create: {
          id: group.id,
          name: group.name,
          photoUrl: group.photoUrl,
          status: group.status,
          notes: group.notes,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        },
        update: {
          name: group.name,
          photoUrl: group.photoUrl,
          status: group.status,
          notes: group.notes,
          updatedAt: group.updatedAt,
        },
        where: { id: group.id },
      }),
      prisma.stalkerGroupMember.deleteMany({
        where: { groupId: group.id },
      }),
      ...group.members.map((member) =>
        prisma.stalkerGroupMember.create({
          data: {
            ...member,
            groupId: group.id,
          },
        }),
      ),
    ]),
  );

  const groups = await prisma.stalkerGroup.findMany({
    include: groupInclude,
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  });

  return Response.json({
    groups: groups.map(mapGroupToResponse),
    skippedMembers,
  });
}
