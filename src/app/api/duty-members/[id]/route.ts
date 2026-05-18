import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildDutyMemberData,
  canDeleteDutyMember,
  createDutyMemberErrorResponse,
  dutyMemberInclude,
  isHiddenDutyMemberRole,
  isDutyMemberExcluded,
  mapDutyMemberToResponse,
  normalizeAccessLogin,
  type DutyMemberPayload,
} from "../duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DutyMemberContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: DutyMemberContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();
  const member = await prisma.dutyMember
    .findUnique({
      include: dutyMemberInclude,
      where: { id },
    })
    .catch(() => null);

  if (!member || !member.accessUserId || isHiddenDutyMemberRole(member.accessUser?.role)) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  return Response.json(mapDutyMemberToResponse(member));
}

export async function PATCH(request: Request, context: DutyMemberContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (auth.role !== "system_admin" && auth.role !== "officer") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as DutyMemberPayload | null;

  if (!payload || typeof payload !== "object") {
    return createDutyMemberErrorResponse("Переданы некорректные данные профиля.");
  }

  const data = buildDutyMemberData(payload);

  if (!data.ok) {
    return createDutyMemberErrorResponse(data.error);
  }

  const prisma = getPrismaClient();
  const currentMember = await prisma.dutyMember
    .findUnique({
      include: dutyMemberInclude,
      where: { id },
    })
    .catch(() => null);

  if (!currentMember || !currentMember.accessUserId || isHiddenDutyMemberRole(currentMember.accessUser?.role)) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  if (auth.role === "officer" && currentMember.accessUser?.role === "system_admin") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const normalizedAccessLogin = normalizeAccessLogin(payload.accessLogin);

  if (!normalizedAccessLogin) {
    return createDutyMemberErrorResponse("Выберите учётную запись доступа.");
  }

  const accessUser = normalizedAccessLogin
    ? await prisma.accessUser
        .findUnique({
          select: {
            displayName: true,
            id: true,
            login: true,
            role: true,
          },
          where: { normalizedLogin: normalizedAccessLogin },
        })
        .catch(() => null)
    : null;

  if (!accessUser) {
    return createDutyMemberErrorResponse("Профиль доступа не найден.");
  }

  if (isHiddenDutyMemberRole(accessUser.role)) {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  if (auth.role === "officer" && accessUser?.role === "system_admin") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  if (accessUser) {
    const linkedMember = await prisma.dutyMember
      .findFirst({
        select: { id: true },
        where: {
          accessUserId: accessUser.id,
          NOT: { id },
        },
      })
      .catch(() => null);

    if (linkedMember) {
      return createDutyMemberErrorResponse("Профиль доступа уже связан с составом.");
    }
  }

  const nextMemberData = {
    ...data.value,
    fullName: data.value.fullName || accessUser.displayName || accessUser.login,
    callSign: data.value.callsign,
    callsign: data.value.callsign,
    accessUserId: accessUser.id,
    updatedAt: new Date(),
  };

  const member = await prisma
    .$transaction(async (transaction) => {
      const updatedMember = await transaction.dutyMember.update({
        data: nextMemberData,
        include: dutyMemberInclude,
        where: { id },
      });

      if (isDutyMemberExcluded(nextMemberData.serviceStatus)) {
        await transaction.accessUser.update({
          data: { isActive: false },
          where: { id: accessUser.id },
        });

        await transaction.dutyStaffPosition.updateMany({
          data: {
            assignedAt: null,
            dutyMemberId: null,
            updatedAt: new Date(),
          },
          where: { dutyMemberId: id },
        });

        return transaction.dutyMember.findUnique({
          include: dutyMemberInclude,
          where: { id },
        });
      }

      return updatedMember;
    })
    .catch(() => null);

  if (!member) {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.", 500);
  }

  return Response.json(mapDutyMemberToResponse(member));
}

export async function DELETE(_request: Request, context: DutyMemberContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();
  const member = await prisma.dutyMember
    .findUnique({
      include: dutyMemberInclude,
      where: { id },
    })
    .catch(() => null);

  if (!member || !member.accessUserId || isHiddenDutyMemberRole(member.accessUser?.role)) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  const permission = canDeleteDutyMember(
    { id: auth.accessUser.id, role: auth.role },
    member.accessUser ? { id: member.accessUser.id, role: member.accessUser.role } : null,
  );

  if (!permission.ok) {
    return createDutyMemberErrorResponse(permission.message, 403);
  }

  const accessUserId = member.accessUserId;
  const excludedMember = await prisma
    .$transaction(async (transaction) => {
      await transaction.accessUser.update({
        data: { isActive: false },
        where: { id: accessUserId },
      });

      await transaction.dutyStaffPosition.updateMany({
        data: {
          assignedAt: null,
          dutyMemberId: null,
          updatedAt: new Date(),
        },
        where: { dutyMemberId: id },
      });

      return transaction.dutyMember.update({
        data: {
          profileStatus: "archived",
          serviceStatus: "discharged",
          updatedAt: new Date(),
        },
        include: dutyMemberInclude,
        where: { id },
      });
    })
    .catch(() => null);

  if (!excludedMember) {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.", 500);
  }

  return Response.json(mapDutyMemberToResponse(excludedMember));
}
