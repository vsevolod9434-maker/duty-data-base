import { getAccessUserDisplayName } from "@/lib/auth/access-user-display";
import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { canonicalDutyStaffPositionIds, canonicalDutyStaffSectionIds } from "@/lib/duty-staff-list";
import { isDutyMemberExcluded, isHiddenDutyMemberRole } from "../../../duty-member-route-utils";
import {
  createStaffListErrorResponse,
  ensureDutyStaffList,
  mapStaffSectionToResponse,
  staffListInclude,
} from "../../staff-list-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PositionContext = {
  params: Promise<{ id: string }>;
};

type PositionPayload = {
  dutyMemberId?: unknown;
};

export async function PATCH(request: Request, context: PositionContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (auth.role !== "system_admin" && auth.role !== "officer") {
    return createStaffListErrorResponse("Недостаточно прав для изменения состава.", 403);
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as PositionPayload | null;
  const nextDutyMemberId =
    payload && typeof payload.dutyMemberId === "string" && payload.dutyMemberId.trim()
      ? payload.dutyMemberId.trim()
      : null;
  const prisma = getPrismaClient();

  if (!canonicalDutyStaffPositionIds.includes(id)) {
    return createStaffListErrorResponse("Должность не найдена.", 404);
  }

  await ensureDutyStaffList(prisma);

  const position = await prisma.dutyStaffPosition
    .findUnique({
      select: { id: true },
      where: { id },
    })
    .catch(() => null);

  if (!position) {
    return createStaffListErrorResponse("Должность не найдена.", 404);
  }

  if (nextDutyMemberId) {
    const member = await prisma.dutyMember
      .findUnique({
        select: {
          accessUser: {
            select: {
              role: true,
            },
          },
          accessUserId: true,
          id: true,
          serviceStatus: true,
        },
        where: { id: nextDutyMemberId },
      })
      .catch(() => null);

    if (!member || !member.accessUserId || isHiddenDutyMemberRole(member.accessUser?.role)) {
      return createStaffListErrorResponse("Профиль не найден.", 404);
    }

    if (isDutyMemberExcluded(member.serviceStatus)) {
      return createStaffListErrorResponse("Доступ к операции запрещён.", 403);
    }

  }

  const actorName = getAccessUserDisplayName(auth.accessUser);

  try {
    await prisma.dutyStaffPosition.update({
      data: nextDutyMemberId
        ? {
            assignedAt: new Date(),
            assignedBy: actorName,
            dutyMemberId: nextDutyMemberId,
            updatedBy: actorName,
          }
        : {
            assignedAt: null,
            dutyMemberId: null,
            updatedBy: actorName,
          },
      where: { id },
    });

    const sections = await prisma.dutyStaffSection.findMany({
      include: staffListInclude,
      where: {
        id: { in: canonicalDutyStaffSectionIds },
      },
      orderBy: { sortOrder: "asc" },
    });

    return Response.json(sections.map(mapStaffSectionToResponse));
  } catch {
    return createStaffListErrorResponse("Не удалось обновить штатную единицу.", 500);
  }
}
