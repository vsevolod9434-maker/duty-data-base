"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const staticLoginErrorMessage = "Не удалось выполнить вход. Проверьте логин и пароль.";
export const staticAccessDeniedMessage = "Доступ к системе запрещён.";
export const staticLookupUnavailableMessage =
  "Не удалось найти активную учётную запись доступа. Проверьте логин или обратитесь к администратору.";

export type StaticAccessUserProfile = {
  id: string;
  authUserId: string;
  login: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
};

export type StaticAccessProfileResult =
  | { status: "ok"; profile: StaticAccessUserProfile }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "inactive"; profile: StaticAccessUserProfile }
  | { status: "error"; message?: string };

export type StaticAuthGateDecision =
  | { action: "allow" }
  | { action: "redirect_home" }
  | { action: "redirect_login"; clearSession: boolean }
  | { action: "retry"; message: string };

type RpcAuthEmailResult = string | { authEmail?: string | null } | Array<string | { authEmail?: string | null }>;

const staticAccessRetryMessage = "Канал допуска временно не отвечает. Повторите проверку.";

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export function isEmailIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function readAuthEmailFromRpcResult(data: RpcAuthEmailResult | null): string | null {
  if (typeof data === "string") {
    return data.trim() || null;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const email: string | null = readAuthEmailFromRpcResult(item);
      if (email) return email;
    }
    return null;
  }

  if (data && typeof data.authEmail === "string") {
    return data.authEmail.trim() || null;
  }

  return null;
}

async function resolveAuthEmailWithRpc(client: SupabaseClient, identifier: string) {
  const { data, error } = await client.rpc("resolve_access_user_auth_email", {
    lookup_identifier: identifier.trim(),
  });

  if (error) {
    if (isServiceUnavailableError(error)) {
      throw new Error(staticAccessRetryMessage);
    }

    return null;
  }

  return readAuthEmailFromRpcResult(data as RpcAuthEmailResult | null);
}

export async function resolveStaticAuthEmail(client: SupabaseClient, identifier: string) {
  const trimmedIdentifier = identifier.trim();

  if (!trimmedIdentifier) {
    throw new Error(staticLoginErrorMessage);
  }

  const rpcAuthEmail = await resolveAuthEmailWithRpc(client, trimmedIdentifier);
  if (rpcAuthEmail) {
    return normalizeEmail(rpcAuthEmail);
  }

  if (isEmailIdentifier(trimmedIdentifier)) {
    return normalizeEmail(trimmedIdentifier);
  }

  // Deliberately do not query AccessUser anonymously here.
  // Internal login resolution is provided only by the narrow SECURITY DEFINER RPC.
  throw new Error(staticLookupUnavailableMessage);
}

export async function clearStaticAuthState(client: SupabaseClient) {
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }

  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

function isServiceUnavailableError(error: unknown) {
  const status = errorStatus(error);

  if (status !== null && status >= 500) {
    return true;
  }

  const message = errorMessage(error)?.toLocaleLowerCase("en-US") ?? "";
  return (
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("connection") ||
    message.includes("timeout")
  );
}

function isCredentialAuthError(error: unknown) {
  const status = errorStatus(error);

  if (status === 400 || status === 401) {
    return true;
  }

  const message = errorMessage(error)?.toLocaleLowerCase("en-US") ?? "";
  return message.includes("invalid login credentials") || message.includes("invalid credentials");
}

export async function getStaticAccessProfileResult(
  client: SupabaseClient,
  authUserId: string | null | undefined,
): Promise<StaticAccessProfileResult> {
  if (!authUserId) {
    return { status: "unauthenticated" };
  }

  try {
    const { data, error } = await client
      .from("AccessUser")
      .select("id, login, displayName, role, isActive, authUserId")
      .eq("authUserId", authUserId)
      .maybeSingle();

    if (error) {
      return { message: error.message, status: "error" };
    }

    if (!data) {
      return { status: "not_found" };
    }

    const profile = data as StaticAccessUserProfile;

    if (!profile.isActive) {
      return { profile, status: "inactive" };
    }

    return { profile, status: "ok" };
  } catch (error) {
    return { message: errorMessage(error), status: "error" };
  }
}

export function getStaticAuthGateDecision(
  profileResult: StaticAccessProfileResult,
  isLoginPage: boolean,
): StaticAuthGateDecision {
  if (profileResult.status === "ok") {
    return isLoginPage ? { action: "redirect_home" } : { action: "allow" };
  }

  if (profileResult.status === "error") {
    return { action: "retry", message: staticAccessRetryMessage };
  }

  if (profileResult.status === "unauthenticated" && isLoginPage) {
    return { action: "allow" };
  }

  return { action: "redirect_login", clearSession: true };
}

export function isCurrentStaticAuthCheck(checkId: number, latestCheckId: number, isMounted: boolean) {
  return isMounted && checkId === latestCheckId;
}

export async function signInStaticAccessUser(client: SupabaseClient, identifier: string, password: string) {
  await clearStaticAuthState(client);

  const email = await resolveStaticAuthEmail(client, identifier);
  let signInResult;

  try {
    signInResult = await client.auth.signInWithPassword({ email, password });
  } catch {
    await clearStaticAuthState(client);
    throw new Error(staticAccessRetryMessage);
  }

  const {
    data: { user },
    error,
  } = signInResult;

  if (error || !user) {
    await clearStaticAuthState(client);

    if (error && !isCredentialAuthError(error)) {
      throw new Error(staticAccessRetryMessage);
    }

    throw new Error(staticLoginErrorMessage);
  }

  const profileResult = await getStaticAccessProfileResult(client, user.id);
  if (profileResult.status === "ok") {
    return profileResult.profile;
  }

  if (profileResult.status === "error") {
    throw new Error(staticAccessRetryMessage);
  }

  if (
    profileResult.status === "inactive" ||
    profileResult.status === "not_found" ||
    profileResult.status === "unauthenticated"
  ) {
    await clearStaticAuthState(client);
    throw new Error(staticAccessDeniedMessage);
  }
}
