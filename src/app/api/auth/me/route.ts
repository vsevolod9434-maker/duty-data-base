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
    return Response.json(
      {
        error: "UNAUTHORIZED",
        message: "Требуется вход в систему.",
      },
      { status: 401 },
    );
  }

  const prisma = getPrismaClient();
  const accessUser = await prisma.accessUser.findUnique({
    select: {
      id: true,
      displayName: true,
      isActive: true,
      login: true,
      role: true,
    },
    where: {
      authUserId: user.id,
    },
  });

  if (!accessUser || !accessUser.isActive) {
    return Response.json(
      {
        error: "FORBIDDEN",
        message: "Доступ к операции запрещён.",
      },
      { status: 403 },
    );
  }

  return Response.json({
    id: accessUser.id,
    login: accessUser.login,
    displayName: accessUser.displayName,
    role: accessUser.role,
    roleLabel: getRoleLabel(accessUser.role as UserRole),
  });
}
