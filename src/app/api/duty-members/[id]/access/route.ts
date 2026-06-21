import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  canManageDutyAccess,
  canViewDutyMemberAccessPassword,
  createDutyMemberErrorResponse,
  dutyMemberInclude,
  getRoleFromDutyAccessLevel,
  isHiddenDutyMemberRole,
  isDutyMemberExcluded,
  mapDutyMemberToResponse,
} from "../../duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DutyMemberAccessContext = {
  params: Promise<{ id: string }>;
};

type AccessPayload = {
  accessLevel?: unknown;
  isActive?: unknown;
};

export async function PATCH(request: Request, context: DutyMemberAccessContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as AccessPayload | null;

  if (!payload || (payload.accessLevel === undefined && typeof payload.isActive !== "boolean")) {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.");
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();
  const member = await prisma.dutyMember
    .findUnique({
      include: dutyMemberInclude,
      where: { id },
    })
    .catch(() => null);

  if (!member || isHiddenDutyMemberRole(member.accessUser?.role)) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  const permission = canManageDutyAccess(
    { id: auth.accessUser.id, role: auth.role },
    member.accessUser ? { id: member.accessUser.id, role: member.accessUser.role } : null,
  );

  if (!permission.ok) {
    return createDutyMemberErrorResponse(permission.message, 403);
  }

  if (isDutyMemberExcluded(member.serviceStatus) && (payload.isActive || payload.accessLevel !== undefined)) {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const requestedAccessRole =
    payload.accessLevel === undefined ? undefined : getRoleFromDutyAccessLevel(payload.accessLevel);

  if (payload.accessLevel !== undefined && !requestedAccessRole) {
    return createDutyMemberErrorResponse("Выберите уровень допуска.");
  }

  const accessUpdated = await prisma.accessUser
    .update({
      data: {
        ...(typeof payload.isActive === "boolean" ? { isActive: payload.isActive } : {}),
        ...(requestedAccessRole ? { role: requestedAccessRole } : {}),
      },
      where: { id: member.accessUser!.id },
    })
    .then(() => true)
    .catch(() => false);

  if (!accessUpdated) {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.", 500);
  }

  const updatedMember = await prisma.dutyMember
    .findUnique({
      include: dutyMemberInclude,
      where: { id },
    })
    .catch(() => null);

  if (!updatedMember) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  return Response.json(mapDutyMemberToResponse(updatedMember, canViewDutyMemberAccessPassword(auth.role)));
}
