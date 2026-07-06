"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type DutyAccessLevel = "officer" | "regular";
type DutyServiceStatus = "active" | "leave" | "wounded" | "missing" | "discharged";
type DutyMemberProfileStatus = "active" | "archived";
type DutyUserRole = "system_admin" | "officer" | "manager" | "regular";

export type AccessAdminDutyMember = {
  id: string;
  fullName: string;
  callsign: string | null;
  rank: string | null;
  position: string | null;
  unit: string | null;
  serviceStatus: DutyServiceStatus;
  profileStatus: DutyMemberProfileStatus;
  notes: string | null;
  photoUrl: string | null;
  positions: Array<{
    id: string;
    title: string;
    sectionId: string;
    sectionName: string;
    sortOrder: number;
  }>;
  access: {
    login: string;
    displayName: string | null;
    role: DutyUserRole;
    roleLabel: string;
    accessLevelLabel: string;
    isActive: boolean;
  } | null;
};

export type CreateDutyMemberUserPayload = {
  accessLevel: DutyAccessLevel;
  displayName: string;
  fullName: string;
  login: string;
  notes: string;
  password: string;
  photoUrl: string;
  rank: string;
  repeatPassword: string;
};

export type UpdateDutyMemberProfilePayload = {
  callsign: string;
  fullName: string;
  notes: string;
  photoUrl: string;
  rank: string;
  serviceStatus: DutyServiceStatus;
};

type AccessAdminRequest =
  | {
      action: "createDutyMemberUser";
      payload: CreateDutyMemberUserPayload;
    }
  | {
      action: "resetPassword";
      memberId: string;
      newPassword: string;
      repeatPassword: string;
    }
  | {
      action: "updateAccess";
      memberId: string;
      accessLevel?: DutyAccessLevel;
      isActive?: boolean;
    }
  | {
      action: "updateDutyMemberProfile";
      memberId: string;
      payload: UpdateDutyMemberProfilePayload;
    }
  | {
      action: "excludeDutyMember";
      memberId: string;
    };

type AccessAdminErrorPayload = {
  error?: unknown;
  message?: unknown;
};

export const accessAdminClosedMessage = "Канал приказов штаба пока не открыт. Действие временно закрыто.";
export const accessAdminSessionExpiredMessage = "Сеанс допуска истёк. Выполните вход повторно.";
export const accessAdminForbiddenMessage = "Недостаточно допуска для этого приказа.";
export const accessAdminTemporaryErrorMessage = "Канал приказов временно не отвечает. Повторите попытку.";

function getAccessAdminFunctionUrl() {
  return process.env.NEXT_PUBLIC_ACCESS_ADMIN_FUNCTION_URL?.trim() ?? "";
}

export function isAccessAdminFunctionConfigured() {
  return Boolean(getAccessAdminFunctionUrl());
}

function mapAccessAdminError(response: Response, payload: AccessAdminErrorPayload | null) {
  if (response.status === 401) {
    return accessAdminSessionExpiredMessage;
  }

  if (response.status === 403) {
    return accessAdminForbiddenMessage;
  }

  const code = typeof payload?.error === "string" ? payload.error : "";

  if (code === "DUPLICATE_LOGIN" || code === "DUPLICATE_EMAIL") {
    return "Такой допуск уже числится в картотеке.";
  }

  if (code === "VALIDATION_FAILED" || code === "INVALID_PAYLOAD") {
    return typeof payload?.message === "string" ? payload.message : "Проверьте поля приказа и повторите попытку.";
  }

  if (code === "NOT_FOUND") {
    return "Профиль состава не найден.";
  }

  if (typeof payload?.message === "string") {
    return payload.message;
  }

  return accessAdminTemporaryErrorMessage;
}

async function readCurrentAccessToken() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error(accessAdminSessionExpiredMessage);
  }

  return data.session.access_token;
}

async function callAccessAdmin<T>(request: AccessAdminRequest): Promise<T> {
  const functionUrl = getAccessAdminFunctionUrl();

  if (!functionUrl) {
    throw new Error(accessAdminClosedMessage);
  }

  const accessToken = await readCurrentAccessToken();
  let response: Response;

  try {
    response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(accessAdminTemporaryErrorMessage);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as AccessAdminErrorPayload | null;
    throw new Error(mapAccessAdminError(response, payload));
  }

  return (await response.json()) as T;
}

export function createDutyMemberUser(payload: CreateDutyMemberUserPayload) {
  return callAccessAdmin<AccessAdminDutyMember>({
    action: "createDutyMemberUser",
    payload,
  });
}

export function resetDutyMemberPassword(memberId: string, newPassword: string, repeatPassword: string) {
  return callAccessAdmin<{ message: string }>({
    action: "resetPassword",
    memberId,
    newPassword,
    repeatPassword,
  });
}

export function updateDutyMemberAccess(
  memberId: string,
  accessPatch: {
    accessLevel?: DutyAccessLevel;
    isActive?: boolean;
  },
) {
  return callAccessAdmin<AccessAdminDutyMember>({
    action: "updateAccess",
    memberId,
    ...accessPatch,
  });
}

export function updateDutyMemberProfile(memberId: string, payload: UpdateDutyMemberProfilePayload) {
  return callAccessAdmin<AccessAdminDutyMember>({
    action: "updateDutyMemberProfile",
    memberId,
    payload,
  });
}

export function excludeDutyMember(memberId: string) {
  return callAccessAdmin<AccessAdminDutyMember>({
    action: "excludeDutyMember",
    memberId,
  });
}
