import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { errorResponse } from "./http.ts";

export type AccessUserRole = "system_admin" | "officer" | "manager" | "regular";

export type AccessUserRecord = {
  id: string;
  authUserId: string;
  login: string;
  displayName: string | null;
  role: AccessUserRole;
  isActive: boolean;
};

export type EdgeAuthContext = {
  getServiceClient: () => SupabaseClient;
  userClient: SupabaseClient;
  user: User;
  accessUser: AccessUserRecord;
};

function readSupabaseUrl() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured.");
  }

  return supabaseUrl;
}

export function createServiceRoleClient() {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient(readSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createUserScopedClient(token: string) {
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!publishableKey) {
    throw new Error("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  return createClient(readSupabaseUrl(), publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireActiveAccessUser(request: Request): Promise<EdgeAuthContext | Response> {
  const token = readBearerToken(request);

  if (!token) {
    return errorResponse(request, "UNAUTHORIZED", "Требуется действующий допуск.", 401);
  }

  const userClient = createUserScopedClient(token);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token);

  if (userError || !user) {
    return errorResponse(request, "UNAUTHORIZED", "Требуется действующий допуск.", 401);
  }

  const { data: accessUser, error: accessUserError } = await userClient
    .from("AccessUser")
    .select("id, authUserId, login, displayName, role, isActive")
    .eq("authUserId", user.id)
    .maybeSingle();

  if (accessUserError || !accessUser || accessUser.isActive !== true) {
    return errorResponse(request, "FORBIDDEN", "Доступ к приказу запрещён.", 403);
  }

  let serviceClient: SupabaseClient | null = null;

  return {
    accessUser: accessUser as AccessUserRecord,
    getServiceClient: () => {
      serviceClient ??= createServiceRoleClient();
      return serviceClient;
    },
    userClient,
    user,
  };
}

export function isAccessOfficer(role: AccessUserRole) {
  return role === "system_admin" || role === "officer";
}

export function canManageTargetAccess(
  actor: Pick<AccessUserRecord, "id" | "role">,
  target: Pick<AccessUserRecord, "id" | "role"> | null,
) {
  if (!isAccessOfficer(actor.role)) {
    return { ok: false as const, message: "Доступ к приказу запрещён." };
  }

  if (!target) {
    return { ok: false as const, message: "Профиль не связан со служебным допуском." };
  }

  if (actor.id === target.id) {
    return { ok: false as const, message: "Нельзя выполнить действие над собственным профилем." };
  }

  if (actor.role === "officer" && target.role === "system_admin") {
    return { ok: false as const, message: "Доступ к приказу запрещён." };
  }

  if (actor.role === "officer" && target.role !== "regular" && target.role !== "manager") {
    return { ok: false as const, message: "Доступ к приказу запрещён." };
  }

  return { ok: true as const };
}
