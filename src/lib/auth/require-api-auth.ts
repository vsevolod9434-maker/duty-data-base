import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { AccessUser } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ApiAuthFailure = {
  ok: false;
  response: NextResponse<{ error: string; message: string }>;
};

type ApiAuthSuccess = {
  ok: true;
  user: User;
  accessUser: Pick<AccessUser, "displayName" | "id" | "isActive" | "login" | "role">;
  role: AccessUser["role"];
  login: string;
  displayName: string | null;
};

export type ApiAuthResult = ApiAuthFailure | ApiAuthSuccess;

function unauthorized() {
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "UNAUTHORIZED",
        message: "Требуется вход в систему.",
      },
      { status: 401 },
    ),
  } satisfies ApiAuthFailure;
}

function forbidden() {
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Доступ к операции запрещён.",
      },
      { status: 403 },
    ),
  } satisfies ApiAuthFailure;
}

export async function requireApiAuth(): Promise<ApiAuthResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorized();
  }

  const prisma = getPrismaClient();
  const accessUser = await prisma.accessUser.findUnique({
    select: {
      displayName: true,
      id: true,
      isActive: true,
      login: true,
      role: true,
    },
    where: {
      authUserId: user.id,
    },
  });

  if (!accessUser || !accessUser.isActive) {
    return forbidden();
  }

  return {
    ok: true,
    user,
    accessUser,
    role: accessUser.role,
    login: accessUser.login,
    displayName: accessUser.displayName,
  };
}
