import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  buildDutyMemberData,
  createDutyMemberErrorResponse,
  dutyMemberInclude,
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
  const members = await prisma.dutyMember.findMany({
    include: dutyMemberInclude,
    orderBy: [{ profileStatus: "asc" }, { fullName: "asc" }],
  });

  return Response.json(members.map(mapDutyMemberToResponse));
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
      where: { accessUserId: accessUser.id },
    });

    if (linkedMember) {
      return createDutyMemberErrorResponse("Профиль доступа уже связан с составом.");
    }
  }

  const now = new Date();
  const member = await prisma.dutyMember
    .create({
      data: {
        id: crypto.randomUUID(),
        ...data.value,
        accessUserId: accessUser?.id ?? null,
        createdAt: now,
        updatedAt: now,
      },
      include: dutyMemberInclude,
    })
    .catch(() => null);

  if (!member) {
    return createDutyMemberErrorResponse("Не удалось выполнить операцию.", 500);
  }

  return Response.json(mapDutyMemberToResponse(member), { status: 201 });
}
