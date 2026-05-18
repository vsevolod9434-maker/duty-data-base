import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDutyMemberErrorResponse, isDutyMemberExcluded } from "../duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PasswordPayload = {
  currentPassword?: unknown;
  newPassword?: unknown;
  repeatPassword?: unknown;
};

const passwordErrorMessage = "Пароль не изменён. Проверьте введённые данные.";

export async function PATCH(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as PasswordPayload | null;

  if (
    !payload ||
    typeof payload.currentPassword !== "string" ||
    typeof payload.newPassword !== "string" ||
    typeof payload.repeatPassword !== "string" ||
    !payload.currentPassword ||
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

  const prisma = getPrismaClient();
  const accessUser = await prisma.accessUser.findUnique({
    select: {
      authEmail: true,
      dutyMember: {
        select: { id: true, serviceStatus: true },
      },
      id: true,
    },
    where: { id: auth.accessUser.id },
  });

  if (!accessUser?.dutyMember) {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  if (isDutyMemberExcluded(accessUser.dutyMember.serviceStatus)) {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: accessUser.authEmail,
    password: payload.currentPassword,
  });

  if (signInError) {
    return createDutyMemberErrorResponse(passwordErrorMessage, 400);
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: payload.newPassword,
  });

  if (updateError) {
    return createDutyMemberErrorResponse(passwordErrorMessage, 400);
  }

  return Response.json({ message: "Пароль изменён." });
}
