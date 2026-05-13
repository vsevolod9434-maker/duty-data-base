import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildDutyMemberData,
  canDeleteDutyMember,
  createDutyMemberErrorResponse,
  dutyMemberInclude,
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
  const member = await prisma.dutyMember.findUnique({
    include: dutyMemberInclude,
    where: { id },
  });

  if (!member) {
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
  const currentMember = await prisma.dutyMember.findUnique({
    include: dutyMemberInclude,
    where: { id },
  });

  if (!currentMember) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  if (auth.role === "officer" && currentMember.accessUser?.role === "system_admin") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const normalizedAccessLogin = normalizeAccessLogin(payload.accessLogin);
  const accessUser = normalizedAccessLogin
    ? await prisma.accessUser.findUnique({
        select: {
          id: true,
          role: true,
        },
        where: { normalizedLogin: normalizedAccessLogin },
      })
    : null;

  if (normalizedAccessLogin && !accessUser) {
    return createDutyMemberErrorResponse("Профиль доступа не найден.");
  }

  if (auth.role === "officer" && accessUser?.role === "system_admin") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  if (accessUser) {
    const linkedMember = await prisma.dutyMember.findFirst({
      select: { id: true },
      where: {
        accessUserId: accessUser.id,
        NOT: { id },
      },
    });

    if (linkedMember) {
      return createDutyMemberErrorResponse("Профиль доступа уже связан с составом.");
    }
  }

  const member = await prisma.dutyMember
    .update({
      data: {
        ...data.value,
        accessUserId: accessUser?.id ?? null,
        updatedAt: new Date(),
      },
      include: dutyMemberInclude,
      where: { id },
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
  const member = await prisma.dutyMember.findUnique({
    include: dutyMemberInclude,
    where: { id },
  });

  if (!member) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  const permission = canDeleteDutyMember(
    { id: auth.accessUser.id, role: auth.role },
    member.accessUser ? { id: member.accessUser.id, role: member.accessUser.role } : null,
  );

  if (!permission.ok) {
    return createDutyMemberErrorResponse(permission.message, 403);
  }

  const deleted = await prisma
    .$transaction(async (transaction) => {
      if (member.accessUser) {
        await transaction.accessUser.update({
          data: { isActive: false },
          where: { id: member.accessUser.id },
        });
      }

      await transaction.dutyMember.delete({
        where: { id },
      });

      return true;
    })
    .catch(() => false);

  if (!deleted) {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.", 500);
  }

  return Response.json({ ok: true });
}
