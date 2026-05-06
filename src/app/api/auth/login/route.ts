import { getRoleLabel, type UserRole } from "@/lib/auth-roles";
import { validateLogin } from "@/lib/auth-login";
import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginErrorMessage = "Не удалось выполнить вход. Проверьте логин и пароль.";

type LoginPayload = {
  login?: unknown;
  password?: unknown;
};

function createErrorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as LoginPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse(loginErrorMessage, 401);
  }

  if (typeof payload.login !== "string") {
    return createErrorResponse("Введите логин.");
  }

  if (typeof payload.password !== "string" || !payload.password) {
    return createErrorResponse("Введите пароль.");
  }

  const loginValidation = validateLogin(payload.login);

  if (!loginValidation.ok) {
    return createErrorResponse(loginValidation.error);
  }

  const prisma = getPrismaClient();
  const accessUser = await prisma.accessUser.findUnique({
    where: { normalizedLogin: loginValidation.normalizedLogin },
  });

  if (!accessUser || !accessUser.isActive) {
    return createErrorResponse(loginErrorMessage, 401);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword({
    email: accessUser.authEmail,
    password: payload.password,
  });

  if (error || !user || user.id !== accessUser.authUserId) {
    await supabase.auth.signOut();
    return createErrorResponse(loginErrorMessage, 401);
  }

  return Response.json({
    ok: true,
    user: {
      login: accessUser.login,
      displayName: accessUser.displayName,
      role: accessUser.role,
      roleLabel: getRoleLabel(accessUser.role as UserRole),
    },
  });
}
