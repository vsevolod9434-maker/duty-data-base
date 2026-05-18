import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildDutyMemberData,
  createDutyMemberErrorResponse,
  dutyMemberInclude,
  isHiddenDutyMemberRole,
  isDutyMemberExcluded,
  mapDutyMemberToResponse,
  normalizeAccessLogin,
  type DutyMemberPayload,
} from "./duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();

  try {
    const members = await prisma.dutyMember.findMany({
      include: dutyMemberInclude,
      where: {
        accessUserId: { not: null },
        accessUser: {
          role: { not: "system_admin" },
        },
      },
      orderBy: [{ profileStatus: "asc" }, { fullName: "asc" }],
    });

    return Response.json(members.map(mapDutyMemberToResponse));
  } catch {
    return createDutyMemberErrorResponse("Не удалось загрузить состав. Повторите попытку позже.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (auth.role !== "system_admin" && auth.role !== "officer") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const payload = (await request.json().catch(() => null)) as DutyMemberPayload | null;

  if (!payload || typeof payload !== "object") {
    return createDutyMemberErrorResponse("Переданы некорректные данные профиля.");
  }

  const data = buildDutyMemberData(payload);

  if (!data.ok) {
    return createDutyMemberErrorResponse(data.error);
  }

  const prisma = getPrismaClient();
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
        where: { accessUserId: accessUser.id },
      })
      .catch(() => null);

    if (linkedMember) {
      return createDutyMemberErrorResponse("Профиль доступа уже связан с составом.");
    }
  }

  const now = new Date();
  const linkedAccessUser = accessUser;
  const memberData = {
    ...data.value,
    fullName: data.value.fullName || linkedAccessUser.displayName || linkedAccessUser.login,
    callSign: data.value.callsign,
    callsign: data.value.callsign,
  };
  const createdMemberId = crypto.randomUUID();
  const member = await prisma
    .$transaction(async (transaction) => {
      await transaction.dutyMember.create({
        data: {
          id: createdMemberId,
          ...memberData,
          accessUserId: linkedAccessUser.id,
          createdAt: now,
          updatedAt: now,
        },
      });

      if (isDutyMemberExcluded(memberData.serviceStatus)) {
        await transaction.accessUser.update({
          data: { isActive: false },
          where: { id: linkedAccessUser.id },
        });
      }

      return transaction.dutyMember.findUnique({
        include: dutyMemberInclude,
        where: { id: createdMemberId },
      });
    })
    .catch(() => null);

  if (!member) {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.", 500);
  }

  return Response.json(mapDutyMemberToResponse(member), { status: 201 });
}
