import { createHash } from "node:crypto";
import type { AccessUserRole } from "@/generated/prisma/client";
import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { validateLogin } from "@/lib/auth-login";
import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  buildDutyMemberData,
  canViewDutyMemberAccessPassword,
  createDutyMemberErrorResponse,
  dutyMemberInclude,
  mapDutyMemberToResponse,
  type DutyMemberPayload,
} from "../duty-member-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateDutyMemberUserPayload = DutyMemberPayload & {
  accessLevel?: unknown;
  displayName?: unknown;
  login?: unknown;
  password?: unknown;
  repeatPassword?: unknown;
};

const operationUnavailableMessage = "Операция временно недоступна.";
const createUserErrorMessage = "Не удалось создать пользователя. Проверьте введённые данные.";

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getRoleFromAccessLevel(value: unknown): AccessUserRole | null {
  if (value === "officer") {
    return "officer";
  }

  if (value === "regular") {
    return "regular";
  }

  return null;
}

function createTechnicalAuthEmail(normalizedLogin: string) {
  const loginHash = createHash("sha256").update(normalizedLogin).digest("hex").slice(0, 40);
  return `u-${loginHash}@duty.local`;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (auth.role !== "system_admin" && auth.role !== "officer") {
    return createDutyMemberErrorResponse("Доступ к операции запрещён.", 403);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createDutyMemberErrorResponse(operationUnavailableMessage, 503);
  }

  const payload = (await request.json().catch(() => null)) as CreateDutyMemberUserPayload | null;

  if (!payload || typeof payload !== "object") {
    return createDutyMemberErrorResponse("Переданы некорректные данные пользователя.");
  }

  if (typeof payload.login !== "string") {
    return createDutyMemberErrorResponse("Введите логин.");
  }

  const loginValidation = validateLogin(payload.login);

  if (!loginValidation.ok) {
    return createDutyMemberErrorResponse(loginValidation.error);
  }

  if (typeof payload.password !== "string" || !payload.password) {
    return createDutyMemberErrorResponse("Введите пароль.");
  }

  if (typeof payload.repeatPassword !== "string" || !payload.repeatPassword) {
    return createDutyMemberErrorResponse("Повторите пароль.");
  }

  if (payload.password !== payload.repeatPassword) {
    return createDutyMemberErrorResponse("Пароль и повтор не совпадают.");
  }

  if (payload.password.length < 8 || payload.password.length > 128) {
    return createDutyMemberErrorResponse("Пароль должен быть от 8 до 128 символов.");
  }

  const role = getRoleFromAccessLevel(payload.accessLevel);

  if (!role) {
    return createDutyMemberErrorResponse("Выберите уровень допуска.");
  }

  const memberData = buildDutyMemberData({
    ...payload,
    accessLogin: payload.login,
    profileStatus: "active",
    serviceStatus: "active",
  });

  if (!memberData.ok) {
    return createDutyMemberErrorResponse(memberData.error);
  }

  const prisma = getPrismaClient();
  const existingAccessUser = await prisma.accessUser
    .findUnique({
      select: { id: true },
      where: { normalizedLogin: loginValidation.normalizedLogin },
    })
    .catch(() => null);

  if (existingAccessUser) {
    return createDutyMemberErrorResponse("Пользователь с таким логином уже существует.");
  }

  const now = new Date();
  const authEmail = createTechnicalAuthEmail(loginValidation.normalizedLogin);
  const displayName = normalizeOptionalString(payload.displayName);
  const login = payload.login.trim();
  const createdMemberId = crypto.randomUUID();
  let createdAuthUserId: string | null = null;

  try {
    const supabase = createSupabaseAdminClient();
    const { data: createdAuthUser, error } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: payload.password,
      email_confirm: true,
    });

    if (error || !createdAuthUser.user?.id) {
      return createDutyMemberErrorResponse(createUserErrorMessage, 400);
    }

    createdAuthUserId = createdAuthUser.user.id;

    const member = await prisma.$transaction(async (transaction) => {
      const accessUser = await transaction.accessUser.create({
        data: {
          authEmail,
          authUserId: createdAuthUserId!,
          displayName,
          isActive: true,
          login,
          normalizedLogin: loginValidation.normalizedLogin,
          password: payload.password,
          role,
        },
        select: { id: true },
      });

      await transaction.dutyMember.create({
        data: {
          id: createdMemberId,
          ...memberData.value,
          callSign: null,
          callsign: null,
          fullName: memberData.value.fullName || displayName || login,
          profileStatus: "active",
          serviceStatus: "active",
          accessUserId: accessUser.id,
          createdAt: now,
          updatedAt: now,
        },
      });

      return transaction.dutyMember.findUnique({
        include: dutyMemberInclude,
        where: { id: createdMemberId },
      });
    });

    if (!member) {
      throw new Error("Created duty member was not found.");
    }

    return Response.json(mapDutyMemberToResponse(member, canViewDutyMemberAccessPassword(auth.role)), { status: 201 });
  } catch {
    if (createdAuthUserId) {
      await createSupabaseAdminClient().auth.admin.deleteUser(createdAuthUserId).catch(() => null);
    }

    return createDutyMemberErrorResponse(createUserErrorMessage, 500);
  }
}
