import { canManageTargetAccess, isAccessOfficer, requireActiveAccessUser, type AccessUserRecord, type AccessUserRole, type EdgeAuthContext } from "../_shared/auth.ts";
import { errorResponse, jsonResponse, logEdgeError, preflightResponse } from "../_shared/http.ts";

type DutyServiceStatus = "active" | "leave" | "wounded" | "missing" | "discharged";
type DutyMemberProfileStatus = "active" | "archived";
type AccessLevel = "officer" | "regular";

type AccessAdminRequest =
  | {
      action: "createDutyMemberUser";
      payload: Record<string, unknown>;
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
      accessLevel?: AccessLevel;
      isActive?: boolean;
    }
  | {
      action: "excludeDutyMember";
      memberId: string;
    };

type DutyMemberRow = {
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
  createdAt: string;
  updatedAt: string;
  accessUser: AccessUserRecord | null;
  staffPositions?: Array<{
    id: string;
    title: string;
    sortOrder: number;
    section: {
      id: string;
      name: string;
      sortOrder: number;
    } | null;
  }> | null;
};

type CreateStageCode =
  | "VALIDATION_FAILED"
  | "DUPLICATE_LOGIN"
  | "DUPLICATE_EMAIL"
  | "AUTH_CREATE_FAILED"
  | "DUTY_MEMBER_CREATE_FAILED"
  | "DUTY_MEMBER_INSERT_FAILED"
  | "DUTY_MEMBER_SELECT_FAILED"
  | "ACCESS_USER_CREATE_FAILED"
  | "CLEANUP_FAILED";

type CreatedRecords = {
  accessUserId?: string | null;
  authUserId?: string | null;
  memberId?: string | null;
};

const dutyMemberSelect =
  "id, fullName, callsign, rank, position, unit, serviceStatus, profileStatus, notes, photoUrl, createdAt, updatedAt, accessUser:AccessUser(id, authUserId, login, displayName, role, isActive), staffPositions:DutyStaffPosition(id, title, sortOrder, section:DutyStaffSection(id, name, sortOrder))";
const createdDutyMemberSelect =
  "id, fullName, callsign, rank, position, unit, serviceStatus, profileStatus, notes, photoUrl, createdAt, updatedAt, accessUser:AccessUser(id, authUserId, login, displayName, role, isActive)";

const serviceStatuses = new Set<DutyServiceStatus>(["active", "leave", "wounded", "missing", "discharged"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function requiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createTextId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function readServiceRoleRestConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw {
      code: "SERVICE_ROLE_KEY_MISSING",
      message: "Service-role duplicate check is not configured.",
    };
  }

  if (serviceRoleKey.startsWith("sb_publishable_")) {
    throw {
      code: "SERVICE_ROLE_KEY_INVALID",
      message: "SUPABASE_SERVICE_ROLE_KEY must not contain a publishable key.",
    };
  }

  const keyRole = readSupabaseJwtRole(serviceRoleKey);
  if (keyRole && keyRole !== "service_role") {
    throw {
      code: "SERVICE_ROLE_KEY_INVALID",
      message: "SUPABASE_SERVICE_ROLE_KEY must contain a service_role key.",
    };
  }

  return { serviceRoleKey, supabaseUrl };
}

function readSupabaseJwtRole(key: string) {
  const [, payload] = key.split(".");
  if (!payload) return null;

  try {
    const paddedPayload = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const decodedPayload = atob(paddedPayload.replaceAll("-", "+").replaceAll("_", "/"));
    const record = asRecord(JSON.parse(decodedPayload));
    return typeof record.role === "string" ? record.role : null;
  } catch {
    return null;
  }
}

async function findAccessUserIdWithServiceRole(column: "authEmail" | "normalizedLogin", value: string) {
  const { serviceRoleKey, supabaseUrl } = readServiceRoleRestConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/AccessUser`);
  url.searchParams.set("select", "id");
  url.searchParams.set(column, `eq.${value}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  const rawBody = await response.text();
  const parsedBody = rawBody ? (JSON.parse(rawBody) as unknown) : null;

  if (!response.ok) {
    const errorBody = asRecord(parsedBody);
    throw {
      code: typeof errorBody.code === "string" ? errorBody.code : undefined,
      constraint: typeof errorBody.constraint === "string" ? errorBody.constraint : undefined,
      message:
        typeof errorBody.message === "string"
          ? errorBody.message
          : `Service-role duplicate check failed with HTTP ${response.status}.`,
    };
  }

  if (!Array.isArray(parsedBody)) {
    throw new Error("Service-role duplicate check returned an unexpected response.");
  }

  const firstRow = asRecord(parsedBody[0]);
  return typeof firstRow.id === "string" ? { id: firstRow.id } : null;
}

function maskIdentifier(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "***";
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

function safeErrorInfo(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    constraint: typeof record.constraint === "string" ? record.constraint : undefined,
    message: error instanceof Error ? error.message : typeof record.message === "string" ? record.message : String(error),
  };
}

function serviceRoleCheckStage(error: unknown, fallbackStage: string) {
  const info = safeErrorInfo(error);
  return info.code?.startsWith("SERVICE_ROLE_KEY_") ? "CHECK_SERVICE_ROLE_KEY" : fallbackStage;
}

function logCreateStageError(
  requestId: string,
  stage: string,
  error: unknown,
  details: { login?: string; role?: AccessUserRole } = {},
) {
  const info = safeErrorInfo(error);
  console.error(
    JSON.stringify({
      action: "createDutyMemberUser",
      code: info.code,
      constraint: info.constraint,
      login: details.login ? maskIdentifier(details.login) : undefined,
      message: info.message,
      requestId,
      role: details.role,
      stage,
    }),
  );
}

function normalizeLogin(login: string) {
  return login.trim().normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function validateLogin(login: unknown) {
  if (typeof login !== "string") {
    return { ok: false as const, message: "Введите логин." };
  }

  const trimmedLogin = login.trim();
  if (!trimmedLogin) {
    return { ok: false as const, message: "Введите логин." };
  }

  const normalizedLogin = normalizeLogin(login);
  if (normalizedLogin.length < 2) {
    return { ok: false as const, message: "Логин слишком короткий." };
  }

  if (normalizedLogin.length > 64) {
    return { ok: false as const, message: "Логин слишком длинный." };
  }

  return { ok: true as const, normalizedLogin, login: trimmedLogin };
}

async function createTechnicalAuthEmail(normalizedLogin: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedLogin));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `u-${hex.slice(0, 40)}@duty.local`;
}

function roleFromAccessLevel(accessLevel: unknown): AccessUserRole | null {
  if (accessLevel === "officer") return "officer";
  if (accessLevel === "regular") return "regular";
  return null;
}

function accessLevelLabel(role: AccessUserRole) {
  if (role === "officer") return "Офицерский допуск";
  if (role === "system_admin") return "Системный доступ";
  return "Базовый допуск";
}

function roleLabel(role: AccessUserRole) {
  if (role === "system_admin") return "Системный администратор";
  if (role === "officer") return "Офицерский допуск";
  return "Базовый допуск";
}

function isExcluded(serviceStatus: DutyServiceStatus) {
  return serviceStatus === "discharged";
}

function mapDutyMember(member: DutyMemberRow) {
  return {
    id: member.id,
    fullName: member.fullName,
    callsign: member.callsign,
    rank: member.rank,
    position: member.position,
    unit: member.unit,
    serviceStatus: member.serviceStatus,
    profileStatus: member.profileStatus,
    notes: member.notes,
    photoUrl: member.photoUrl,
    positions: (member.staffPositions ?? []).map((position) => ({
      id: position.id,
      title: position.title,
      sectionId: position.section?.id ?? "",
      sectionName: position.section?.name ?? "",
      sortOrder: position.sortOrder,
    })),
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    access: member.accessUser
      ? {
          login: member.accessUser.login,
          displayName: member.accessUser.displayName,
          role: member.accessUser.role,
          roleLabel: roleLabel(member.accessUser.role),
          accessLevelLabel: accessLevelLabel(member.accessUser.role),
          isActive: isExcluded(member.serviceStatus) ? false : member.accessUser.isActive,
        }
      : null,
  };
}

async function findDutyMember(context: EdgeAuthContext, memberId: string) {
  const { data, error } = await context.getServiceClient()
    .from("DutyMember")
    .select(dutyMemberSelect)
    .eq("id", memberId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as DutyMemberRow;
}

async function findCreatedDutyMember(context: EdgeAuthContext, memberId: string) {
  const { data, error } = await context.getServiceClient()
    .from("DutyMember")
    .select(createdDutyMemberSelect)
    .eq("id", memberId)
    .maybeSingle();

  return {
    data: data ? (data as DutyMemberRow) : null,
    error,
  };
}

function requireSystemAdmin(request: Request, context: EdgeAuthContext) {
  if (context.accessUser.role !== "system_admin") {
    return errorResponse(request, "FORBIDDEN", "Доступ к приказу запрещён.", 403);
  }

  return null;
}

function buildDutyMemberData(payload: Record<string, unknown>) {
  const serviceStatus = serviceStatuses.has(payload.serviceStatus as DutyServiceStatus)
    ? (payload.serviceStatus as DutyServiceStatus)
    : "active";
  const profileStatus: DutyMemberProfileStatus = serviceStatus === "discharged" ? "archived" : "active";

  return {
    callSign: optionalString(payload.callsign),
    callsign: optionalString(payload.callsign),
    fullName: requiredString(payload.fullName),
    notes: optionalString(payload.notes),
    photoUrl: optionalString(payload.photoUrl),
    position: optionalString(payload.position),
    profileStatus,
    rank: optionalString(payload.rank),
    serviceStatus,
    unit: optionalString(payload.unit),
  };
}

async function cleanupCreatedDutyMemberUser(serviceClient: EdgeAuthContext["userClient"], records: CreatedRecords) {
  let cleanupFailed = false;

  if (records.memberId) {
    const { error } = await serviceClient.from("DutyMember").delete().eq("id", records.memberId);
    cleanupFailed ||= Boolean(error);
  }

  if (records.accessUserId) {
    const { error } = await serviceClient.from("AccessUser").delete().eq("id", records.accessUserId);
    cleanupFailed ||= Boolean(error);
  } else if (records.authUserId) {
    const { error } = await serviceClient.from("AccessUser").delete().eq("authUserId", records.authUserId);
    cleanupFailed ||= Boolean(error);
  }

  if (records.authUserId) {
    const { error } = await serviceClient.auth.admin.deleteUser(records.authUserId);
    cleanupFailed ||= Boolean(error);
  }

  return cleanupFailed ? "CLEANUP_FAILED" : null;
}

function createStageErrorResponse(request: Request, code: CreateStageCode, message: string, status: number) {
  return errorResponse(request, code, message, status);
}

async function createDutyMemberUser(request: Request, context: EdgeAuthContext, payload: Record<string, unknown>) {
  const requestId = crypto.randomUUID();

  if (!isAccessOfficer(context.accessUser.role)) {
    return errorResponse(request, "FORBIDDEN", "Доступ к приказу запрещён.", 403);
  }

  const loginValidation = validateLogin(payload.login);
  if (!loginValidation.ok) {
    return createStageErrorResponse(request, "VALIDATION_FAILED", loginValidation.message, 400);
  }

  if (typeof payload.password !== "string" || !payload.password) {
    return createStageErrorResponse(request, "VALIDATION_FAILED", "Введите пароль.", 400);
  }

  if (typeof payload.repeatPassword !== "string" || !payload.repeatPassword) {
    return createStageErrorResponse(request, "VALIDATION_FAILED", "Повторите пароль.", 400);
  }

  if (payload.password !== payload.repeatPassword) {
    return createStageErrorResponse(request, "VALIDATION_FAILED", "Пароль и повтор не совпадают.", 400);
  }

  if (payload.password.length < 8 || payload.password.length > 128) {
    return createStageErrorResponse(request, "VALIDATION_FAILED", "Пароль должен быть от 8 до 128 символов.", 400);
  }

  const role = roleFromAccessLevel(payload.accessLevel);
  if (!role) {
    return createStageErrorResponse(request, "VALIDATION_FAILED", "Выберите уровень допуска.", 400);
  }

  if (context.accessUser.role === "officer" && role !== "regular") {
    return errorResponse(request, "FORBIDDEN", "Офицер может выдать только базовый допуск.", 403);
  }

  const serviceClient = context.getServiceClient();
  let existingAccessUser: { id: string } | null = null;
  try {
    existingAccessUser = await findAccessUserIdWithServiceRole("normalizedLogin", loginValidation.normalizedLogin);
  } catch (error) {
    logCreateStageError(requestId, serviceRoleCheckStage(error, "CHECK_DUPLICATE_LOGIN"), error, {
      login: loginValidation.login,
      role,
    });
    return createStageErrorResponse(request, "ACCESS_USER_CREATE_FAILED", "Не удалось проверить учетную запись.", 500);
  }

  if (existingAccessUser) {
    return createStageErrorResponse(request, "DUPLICATE_LOGIN", "Пользователь с таким логином уже существует.", 409);
  }

  const authEmail = await createTechnicalAuthEmail(loginValidation.normalizedLogin);
  let existingAuthEmail: { id: string } | null = null;
  try {
    existingAuthEmail = await findAccessUserIdWithServiceRole("authEmail", authEmail);
  } catch (error) {
    logCreateStageError(requestId, serviceRoleCheckStage(error, "CHECK_DUPLICATE_EMAIL"), error, {
      login: loginValidation.login,
      role,
    });
    return createStageErrorResponse(request, "ACCESS_USER_CREATE_FAILED", "Не удалось проверить учетную запись.", 500);
  }

  if (existingAuthEmail) {
    return createStageErrorResponse(request, "DUPLICATE_EMAIL", "Учетная запись уже существует.", 409);
  }

  const displayName = optionalString(payload.displayName);
  const memberData = buildDutyMemberData({
    ...payload,
    accessLogin: loginValidation.login,
    serviceStatus: "active",
  });
  const now = new Date().toISOString();
  const accessUserId = createTextId("access");
  const memberId = crypto.randomUUID();
  let authUserId: string | null = null;
  let createdAccessUserId: string | null = null;
  let createdMemberId: string | null = null;

  try {
    const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
      email: authEmail,
      password: payload.password,
      email_confirm: true,
    });

    if (createUserError || !createdUser.user?.id) {
      logCreateStageError(requestId, "AUTH_CREATE_FAILED", createUserError ?? new Error("Auth user id is missing."), {
        login: loginValidation.login,
        role,
      });
      return errorResponse(request, "AUTH_CREATE_FAILED", "Не удалось создать служебный допуск.", 400);
    }

    authUserId = createdUser.user.id;

    const { data: accessUser, error: accessUserError } = await serviceClient
      .from("AccessUser")
      .insert({
        id: accessUserId,
        authEmail,
        authUserId,
        createdAt: now,
        displayName,
        isActive: true,
        login: loginValidation.login,
        normalizedLogin: loginValidation.normalizedLogin,
        role,
        updatedAt: now,
      })
      .select("id")
      .single();

    if (accessUserError || !accessUser?.id) {
      logCreateStageError(requestId, "ACCESS_USER_CREATE_FAILED", accessUserError ?? new Error("AccessUser insert failed."), {
        login: loginValidation.login,
        role,
      });
      const cleanupCode = await cleanupCreatedDutyMemberUser(serviceClient, { authUserId });
      return createStageErrorResponse(
        request,
        cleanupCode ?? "ACCESS_USER_CREATE_FAILED",
        "Не удалось создать учетную запись.",
        500,
      );
    }

    createdAccessUserId = accessUser.id;
    const fullName = memberData.fullName || displayName || loginValidation.login;
    const { error: memberError } = await serviceClient.from("DutyMember").insert({
      id: memberId,
      ...memberData,
      accessUserId: accessUser.id,
      callSign: null,
      callsign: null,
      createdAt: now,
      fullName,
      profileStatus: "active",
      serviceStatus: "active",
      updatedAt: now,
    });

    if (memberError) {
      logCreateStageError(requestId, "DUTY_MEMBER_INSERT_FAILED", memberError, {
        login: loginValidation.login,
        role,
      });
      const cleanupCode = await cleanupCreatedDutyMemberUser(serviceClient, { accessUserId: createdAccessUserId, authUserId });
      return createStageErrorResponse(
        request,
        cleanupCode ?? "DUTY_MEMBER_INSERT_FAILED",
        "Не удалось создать профиль состава.",
        500,
      );
    }

    createdMemberId = memberId;
    const { data: member, error: memberSelectError } = await findCreatedDutyMember(context, memberId);
    if (memberSelectError || !member) {
      logCreateStageError(requestId, "DUTY_MEMBER_SELECT_FAILED", memberSelectError ?? new Error("Created DutyMember was not found."), {
        login: loginValidation.login,
        role,
      });
      const cleanupCode = await cleanupCreatedDutyMemberUser(serviceClient, {
        accessUserId: createdAccessUserId,
        authUserId,
        memberId: createdMemberId,
      });
      return createStageErrorResponse(
        request,
        cleanupCode ?? "DUTY_MEMBER_SELECT_FAILED",
        "Не удалось создать профиль состава.",
        500,
      );
    }

    return jsonResponse(request, mapDutyMember(member), 201);
  } catch (error) {
    logCreateStageError(requestId, "DUTY_MEMBER_CREATE_FAILED", error, {
      login: loginValidation.login,
      role,
    });

    const cleanupCode = await cleanupCreatedDutyMemberUser(serviceClient, {
      accessUserId: createdAccessUserId,
      authUserId,
      memberId: createdMemberId,
    });

    return createStageErrorResponse(request, cleanupCode ?? "DUTY_MEMBER_CREATE_FAILED", "Не удалось создать профиль состава.", 500);
  }
}

function assertTargetManageable(request: Request, context: EdgeAuthContext, member: DutyMemberRow | null) {
  if (!member?.accessUser || member.accessUser.role === "system_admin") {
    return errorResponse(request, "NOT_FOUND", "Профиль не найден.", 404);
  }

  const permission = canManageTargetAccess(context.accessUser, member.accessUser);
  if (!permission.ok) {
    return errorResponse(request, "FORBIDDEN", permission.message, 403);
  }

  return null;
}

async function updateAccess(request: Request, context: EdgeAuthContext, body: Extract<AccessAdminRequest, { action: "updateAccess" }>) {
  const systemAdminError = requireSystemAdmin(request, context);
  if (systemAdminError) return systemAdminError;

  if (typeof body.memberId !== "string" || !body.memberId) {
    return errorResponse(request, "INVALID_PAYLOAD", "Профиль не найден.", 400);
  }

  if (body.accessLevel === undefined && typeof body.isActive !== "boolean") {
    return errorResponse(request, "INVALID_PAYLOAD", "Не удалось выполнить приказ.", 400);
  }

  const member = await findDutyMember(context, body.memberId);
  const targetError = assertTargetManageable(request, context, member);
  if (targetError) return targetError;

  if (!member?.accessUser) {
    return errorResponse(request, "NOT_FOUND", "Профиль не найден.", 404);
  }

  if (isExcluded(member.serviceStatus) && (body.isActive === true || body.accessLevel !== undefined)) {
    return errorResponse(request, "FORBIDDEN", "Доступ к приказу запрещён.", 403);
  }

  const requestedRole = body.accessLevel === undefined ? undefined : roleFromAccessLevel(body.accessLevel);
  if (body.accessLevel !== undefined && !requestedRole) {
    return errorResponse(request, "INVALID_PAYLOAD", "Выберите уровень допуска.", 400);
  }

  const { error } = await context.getServiceClient()
    .from("AccessUser")
    .update({
      ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
      ...(requestedRole ? { role: requestedRole } : {}),
    })
    .eq("id", member.accessUser.id);

  if (error) {
    logEdgeError("access-admin:updateAccess", error);
    return errorResponse(request, "UPDATE_FAILED", "Не удалось выполнить приказ.", 500);
  }

  const updatedMember = await findDutyMember(context, body.memberId);
  if (!updatedMember) {
    return errorResponse(request, "NOT_FOUND", "Профиль не найден.", 404);
  }

  return jsonResponse(request, mapDutyMember(updatedMember));
}

async function resetPassword(request: Request, context: EdgeAuthContext, body: Extract<AccessAdminRequest, { action: "resetPassword" }>) {
  if (!isAccessOfficer(context.accessUser.role)) {
    return errorResponse(request, "FORBIDDEN", "Доступ к приказу запрещён.", 403);
  }

  if (typeof body.memberId !== "string" || !body.memberId) {
    return errorResponse(request, "INVALID_PAYLOAD", "Профиль не найден.", 400);
  }

  if (typeof body.newPassword !== "string" || typeof body.repeatPassword !== "string" || !body.newPassword || !body.repeatPassword) {
    return errorResponse(request, "INVALID_PAYLOAD", "Заполните все поля.", 400);
  }

  if (body.newPassword !== body.repeatPassword) {
    return errorResponse(request, "INVALID_PAYLOAD", "Новый пароль и повтор не совпадают.", 400);
  }

  if (body.newPassword.length < 8 || body.newPassword.length > 128) {
    return errorResponse(request, "INVALID_PAYLOAD", "Новый пароль должен быть от 8 до 128 символов.", 400);
  }

  const member = await findDutyMember(context, body.memberId);
  const targetError = assertTargetManageable(request, context, member);
  if (targetError) return targetError;

  if (!member?.accessUser || !member.accessUser.isActive || isExcluded(member.serviceStatus)) {
    return errorResponse(request, "FORBIDDEN", "Недостаточно прав для изменения пароля.", 403);
  }

  const { error } = await context.getServiceClient().auth.admin.updateUserById(member.accessUser.authUserId, {
    password: body.newPassword,
  });

  if (error) {
    logEdgeError("access-admin:resetPassword", error);
    return errorResponse(request, "PASSWORD_UPDATE_FAILED", "Пароль не изменён. Проверьте введённые данные.", 400);
  }

  return jsonResponse(request, { message: "Пароль изменён." });
}

async function excludeDutyMember(request: Request, context: EdgeAuthContext, body: Extract<AccessAdminRequest, { action: "excludeDutyMember" }>) {
  const systemAdminError = requireSystemAdmin(request, context);
  if (systemAdminError) return systemAdminError;

  if (typeof body.memberId !== "string" || !body.memberId) {
    return errorResponse(request, "INVALID_PAYLOAD", "Профиль не найден.", 400);
  }

  const member = await findDutyMember(context, body.memberId);
  const targetError = assertTargetManageable(request, context, member);
  if (targetError) return targetError;

  if (!member?.accessUser) {
    return errorResponse(request, "NOT_FOUND", "Профиль не найден.", 404);
  }

  const now = new Date().toISOString();
  const serviceClient = context.getServiceClient();
  const { error: accessError } = await serviceClient
    .from("AccessUser")
    .update({ isActive: false })
    .eq("id", member.accessUser.id);

  if (accessError) {
    logEdgeError("access-admin:excludeDutyMember:access", accessError);
    return errorResponse(request, "UPDATE_FAILED", "Не удалось выполнить приказ.", 500);
  }

  const { error: memberError } = await serviceClient
    .from("DutyMember")
    .update({
      profileStatus: "archived",
      serviceStatus: "discharged",
      updatedAt: now,
    })
    .eq("id", body.memberId);

  if (memberError) {
    logEdgeError("access-admin:excludeDutyMember:member", memberError);
    return errorResponse(request, "UPDATE_FAILED", "Не удалось выполнить приказ.", 500);
  }

  const updatedMember = await findDutyMember(context, body.memberId);
  if (!updatedMember) {
    return errorResponse(request, "NOT_FOUND", "Профиль не найден.", 404);
  }

  return jsonResponse(request, mapDutyMember(updatedMember));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return preflightResponse(request);
  }

  if (request.method !== "POST") {
    return errorResponse(request, "METHOD_NOT_ALLOWED", "Приказ не распознан.", 405);
  }

  try {
    const auth = await requireActiveAccessUser(request);
    if (auth instanceof Response) {
      return auth;
    }

    const body = asRecord(await request.json().catch(() => null)) as Partial<AccessAdminRequest>;

    switch (body.action) {
      case "createDutyMemberUser":
        return await createDutyMemberUser(request, auth, asRecord(body.payload));
      case "resetPassword":
        return await resetPassword(request, auth, body as Extract<AccessAdminRequest, { action: "resetPassword" }>);
      case "updateAccess":
        return await updateAccess(request, auth, body as Extract<AccessAdminRequest, { action: "updateAccess" }>);
      case "excludeDutyMember":
        return await excludeDutyMember(request, auth, body as Extract<AccessAdminRequest, { action: "excludeDutyMember" }>);
      default:
        return errorResponse(request, "UNKNOWN_ACTION", "Приказ не распознан.", 400);
    }
  } catch (error) {
    logEdgeError("access-admin", error);
    return errorResponse(request, "INTERNAL_ERROR", "Не удалось выполнить приказ.", 500);
  }
});
