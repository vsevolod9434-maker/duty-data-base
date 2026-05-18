import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  canManageDutyAccess,
  createDutyMemberErrorResponse,
  dutyMemberInclude,
  isDutyMemberExcluded,
  mapDutyMemberToResponse,
} from "../../duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DutyMemberAccessContext = {
  params: Promise<{ id: string }>;
};

type AccessPayload = {
  isActive?: unknown;
};

export async function PATCH(request: Request, context: DutyMemberAccessContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as AccessPayload | null;

  if (!payload || typeof payload.isActive !== "boolean") {
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

  if (!member) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  const permission = canManageDutyAccess(
    { id: auth.accessUser.id, role: auth.role },
    member.accessUser ? { id: member.accessUser.id, role: member.accessUser.role } : null,
  );

  if (!permission.ok) {
    return createDutyMemberErrorResponse(permission.message, 403);
  }

  if (isDutyMemberExcluded(member.serviceStatus) && payload.isActive) {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const accessUpdated = await prisma.accessUser
    .update({
      data: { isActive: payload.isActive },
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

  return Response.json(mapDutyMemberToResponse(updatedMember));
}
