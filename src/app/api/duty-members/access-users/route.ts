import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getRoleLabel, type UserRole } from "@/lib/auth-roles";
import { getDutyAccessLevelLabel } from "@/lib/duty-members";
import { getPrismaClient } from "@/lib/prisma";
import { createDutyMemberErrorResponse } from "../duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (auth.role !== "system_admin" && auth.role !== "officer") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  const prisma = getPrismaClient();

  try {
    const users = await prisma.accessUser.findMany({
      orderBy: [{ displayName: "asc" }, { login: "asc" }],
      select: {
        displayName: true,
        dutyMember: {
          select: { id: true },
        },
        isActive: true,
        login: true,
        role: true,
      },
      where: {
        role: {
          not: "system_admin",
        },
      },
    });

    return Response.json(
      users.map((user) => ({
        login: user.login,
        displayName: user.displayName,
        role: user.role,
        roleLabel: getRoleLabel(user.role as UserRole),
        accessLevelLabel: getDutyAccessLevelLabel(user.role as UserRole),
        isActive: user.isActive,
        dutyMemberId: user.dutyMember?.id ?? null,
      })),
    );
  } catch {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.", 500);
  }
}
