import { getAccessUserDisplayName } from "@/lib/auth/access-user-display";
import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { canonicalDutyStaffPositionIds, canonicalDutyStaffSectionIds } from "@/lib/duty-staff-list";
import { isDutyMemberExcluded, isHiddenDutyMemberRole } from "../../duty-member-route-utils";
import {
  createStaffListErrorResponse,
  ensureDutyStaffList,
  mapStaffSectionToResponse,
  staffListInclude,
} from "../staff-list-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PositionsPayload = {
  dutyMemberId?: unknown;
  positionIds?: unknown;
};

function normalizePositionIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((positionId): positionId is string => typeof positionId === "string").map((positionId) => positionId.trim()))).filter(Boolean);
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (auth.role !== "system_admin" && auth.role !== "officer") {
    return createStaffListErrorResponse("Недостаточно прав для изменения состава.", 403);
  }

  const payload = (await request.json().catch(() => null)) as PositionsPayload | null;
  const dutyMemberId = payload && typeof payload.dutyMemberId === "string" ? payload.dutyMemberId.trim() : "";
  const positionIds = normalizePositionIds(payload?.positionIds);

  if (!dutyMemberId) {
    return createStaffListErrorResponse("Выберите профиль состава.");
  }

  if (positionIds.length === 0) {
    return createStaffListErrorResponse("Выберите одну или несколько штатных единиц.");
  }

  if (positionIds.some((positionId) => !canonicalDutyStaffPositionIds.includes(positionId))) {
    return createStaffListErrorResponse("В списке выбрана неизвестная штатная единица.", 404);
  }

  const prisma = getPrismaClient();

  await ensureDutyStaffList(prisma);

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
      where: { id: dutyMemberId },
    })
    .catch(() => null);

  if (!member || !member.accessUserId || isHiddenDutyMemberRole(member.accessUser?.role)) {
    return createStaffListErrorResponse("Профиль не найден.", 404);
  }

  if (isDutyMemberExcluded(member.serviceStatus)) {
    return createStaffListErrorResponse("Доступ к операции запрещён.", 403);
  }

  const positions = await prisma.dutyStaffPosition.findMany({
    select: {
      dutyMemberId: true,
      id: true,
    },
    where: {
      id: { in: positionIds },
    },
  });

  if (positions.length !== positionIds.length) {
    return createStaffListErrorResponse("Одна или несколько штатных единиц не найдены.", 404);
  }

  if (positions.some((position) => position.dutyMemberId)) {
    return createStaffListErrorResponse("Массовое назначение доступно только для вакантных штатных единиц. Занятые должности меняются через карточку должности.");
  }

  const actorName = getAccessUserDisplayName(auth.accessUser);

  try {
    await prisma.dutyStaffPosition.updateMany({
      data: {
        assignedAt: new Date(),
        assignedBy: actorName,
        dutyMemberId,
        updatedBy: actorName,
      },
      where: {
        id: { in: positionIds },
      },
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
    return createStaffListErrorResponse("Не удалось выполнить массовое назначение.", 500);
  }
}
