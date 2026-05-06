import { getRoleLabel, type UserRole } from "@/lib/auth-roles";
import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Пользователь не авторизован." }, { status: 401 });
  }

  const prisma = getPrismaClient();
  const accessUser = await prisma.accessUser.findFirst({
    where: {
      OR: [{ authUserId: user.id }, { authEmail: user.email ?? "" }],
    },
  });

  if (!accessUser) {
    return Response.json({
      login: user.email ?? "Пользователь",
      displayName: null,
      role: null,
      roleLabel: null,
      email: user.email ?? null,
    });
  }

  return Response.json({
    login: accessUser.login,
    displayName: accessUser.displayName,
    role: accessUser.role,
    roleLabel: getRoleLabel(accessUser.role as UserRole),
    email: user.email ?? null,
  });
}
