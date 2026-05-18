import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  canManageDutyAccess,
  createDutyMemberErrorResponse,
  isDutyMemberExcluded,
  isHiddenDutyMemberRole,
} from "../../duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DutyMemberPasswordContext = {
  params: Promise<{ id: string }>;
};

type ResetPasswordPayload = {
  newPassword?: unknown;
  repeatPassword?: unknown;
};

const resetPasswordErrorMessage = "Пароль не изменён. Проверьте введённые данные.";
const operationUnavailableMessage = "Операция временно недоступна.";

export async function PATCH(request: Request, context: DutyMemberPasswordContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as ResetPasswordPayload | null;

  if (
    !payload ||
    typeof payload.newPassword !== "string" ||
    typeof payload.repeatPassword !== "string" ||
    !payload.newPassword ||
    !payload.repeatPassword
  ) {
    return createDutyMemberErrorResponse("Заполните все поля.");
  }

  if (payload.newPassword !== payload.repeatPassword) {
    return createDutyMemberErrorResponse("Новый пароль и повтор не совпадают.");
  }

  if (payload.newPassword.length < 8 || payload.newPassword.length > 128) {
    return createDutyMemberErrorResponse("Новый пароль должен быть от 8 до 128 символов.");
  }

  const { id } = await context.params;
  const prisma = getPrismaClient();
  const member = await prisma.dutyMember
    .findUnique({
      select: {
        accessUser: {
          select: {
            authUserId: true,
            id: true,
            role: true,
          },
        },
        id: true,
        serviceStatus: true,
      },
      where: { id },
    })
    .catch(() => null);

  if (!member?.accessUser || isHiddenDutyMemberRole(member.accessUser.role)) {
    return createDutyMemberErrorResponse("Профиль не найден.", 404);
  }

  const permission = canManageDutyAccess(
    { id: auth.accessUser.id, role: auth.role },
    { id: member.accessUser.id, role: member.accessUser.role },
  );

  if (!permission.ok) {
    return createDutyMemberErrorResponse(permission.message, 403);
  }

  if (isDutyMemberExcluded(member.serviceStatus)) {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createDutyMemberErrorResponse(operationUnavailableMessage, 503);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(member.accessUser.authUserId, {
      password: payload.newPassword,
    });

    if (error) {
      return createDutyMemberErrorResponse(resetPasswordErrorMessage, 400);
    }
  } catch {
    return createDutyMemberErrorResponse(resetPasswordErrorMessage, 500);
  }

  return Response.json({ message: "Пароль изменён." });
}
