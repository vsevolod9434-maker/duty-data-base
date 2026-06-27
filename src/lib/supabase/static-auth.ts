"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLogin } from "@/lib/auth-login";

export const staticLoginErrorMessage = "Не удалось выполнить вход. Проверьте логин и пароль.";
export const staticAccessDeniedMessage = "Доступ к системе запрещён.";
export const staticLookupUnavailableMessage =
  "Не удалось найти активную учётную запись доступа. Проверьте логин или обратитесь к администратору.";

type AccessUserLookupRow = {
  authEmail?: string | null;
  isActive?: boolean | null;
};

export type StaticAccessUserProfile = {
  id: string;
  authUserId: string;
  login: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
};

type RpcAuthEmailResult = string | { authEmail?: string | null } | Array<string | { authEmail?: string | null }>;

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
    return null;
  }

  return readAuthEmailFromRpcResult(data as RpcAuthEmailResult | null);
}

async function lookupAccessUserAuthEmailByColumn(client: SupabaseClient, column: string, value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const { data, error } = await client
    .from("AccessUser")
    .select("authEmail,isActive")
    .eq(column, normalizedValue)
    .eq("isActive", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  const accessUser = data as AccessUserLookupRow | null;
  return accessUser?.isActive === true && accessUser.authEmail ? accessUser.authEmail.trim() : null;
}

async function resolveAuthEmailWithTableLookup(client: SupabaseClient, identifier: string) {
  const trimmedIdentifier = identifier.trim();
  const normalizedIdentifier = normalizeLogin(trimmedIdentifier);
  const candidates: Array<[string, string]> = [
    ["authEmail", normalizeEmail(trimmedIdentifier)],
    ["normalizedLogin", normalizedIdentifier],
    ["login", trimmedIdentifier],
    ["displayName", trimmedIdentifier],
  ];

  for (const [column, value] of candidates) {
    const authEmail = await lookupAccessUserAuthEmailByColumn(client, column, value);
    if (authEmail) {
      return authEmail;
    }
  }

  return null;
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

  const tableAuthEmail = await resolveAuthEmailWithTableLookup(client, trimmedIdentifier);
  if (tableAuthEmail) {
    return normalizeEmail(tableAuthEmail);
  }

  if (isEmailIdentifier(trimmedIdentifier)) {
    return normalizeEmail(trimmedIdentifier);
  }

  throw new Error(staticLookupUnavailableMessage);
}

export async function clearStaticAuthState(client: SupabaseClient) {
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
}

export async function getStaticAccessUserProfile(client: SupabaseClient, authUserId: string) {
  const { data, error } = await client
    .from("AccessUser")
    .select("id, login, displayName, role, isActive, authUserId")
    .eq("authUserId", authUserId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as StaticAccessUserProfile;
}

export async function signInStaticAccessUser(client: SupabaseClient, identifier: string, password: string) {
  await clearStaticAuthState(client);

  const email = await resolveStaticAuthEmail(client, identifier);
  const {
    data: { user },
    error,
  } = await client.auth.signInWithPassword({ email, password });

  if (error || !user) {
    await clearStaticAuthState(client);
    throw new Error(staticLoginErrorMessage);
  }

  const accessUser = await getStaticAccessUserProfile(client, user.id);
  if (!accessUser?.isActive) {
    await clearStaticAuthState(client);
    throw new Error(staticAccessDeniedMessage);
  }

  return accessUser;
}
