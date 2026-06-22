"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRoleLabel, type UserRole } from "@/lib/auth-roles";
import { normalizeLogin } from "@/lib/auth-login";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type JsonRecord = Record<string, unknown>;

const staticExportEnabled = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const blockedAdminMessage =
  "Операция требует защищённого серверного обработчика и недоступна на статическом хостинге GitHub Pages.";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function errorResponse(message: string, status = 400) {
  return json({ error: message, message }, status);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  const normalized = stringValue(value).trim();
  return normalized || null;
}

function nowIso() {
  return new Date().toISOString();
}

async function requestBody(init?: RequestInit) {
  if (typeof init?.body !== "string") {
    return {};
  }

  try {
    return asRecord(JSON.parse(init.body));
  } catch {
    return {};
  }
}

async function currentAccessUser(client: SupabaseClient) {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) {
    throw new Error("Требуется вход в систему.");
  }

  const { data, error } = await client
    .from("AccessUser")
    .select("id, login, displayName, role, isActive, authUserId")
    .eq("authUserId", user.id)
    .maybeSingle();

  if (error || !data || !data.isActive) {
    throw new Error("Доступ к системе запрещён.");
  }

  return data;
}

function actorLabel(accessUser: JsonRecord) {
  return nullableString(accessUser.displayName) ?? nullableString(accessUser.login) ?? "Пользователь";
}

async function assertAuthenticated(client: SupabaseClient) {
  return currentAccessUser(client);
}

async function selectRows(client: SupabaseClient, table: string, select = "*", orderColumn?: string, ascending = false) {
  let query = client.from(table).select(select);

  if (orderColumn) {
    query = query.order(orderColumn, { ascending });
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

function formatSimpleRow(table: string, row: unknown) {
  return table === "Stalker" ? { ...asRecord(row), taskMark: "none" } : row;
}

async function replaceChildren(
  client: SupabaseClient,
  table: string,
  foreignKey: string,
  parentId: string,
  children: unknown[],
) {
  const { error: deleteError } = await client.from(table).delete().eq(foreignKey, parentId);

  if (deleteError) {
    throw deleteError;
  }

  if (children.length > 0) {
    const { error: insertError } = await client.from(table).insert(children);

    if (insertError) {
      throw insertError;
    }
  }
}

function normalizeParentPayload(payload: JsonRecord, id: string, isNew: boolean) {
  const timestamp = nowIso();
  return {
    ...payload,
    id,
    ...(isNew ? { createdAt: stringValue(payload.createdAt) || timestamp } : {}),
    updatedAt: timestamp,
  };
}

function simpleInsertRecord(table: string, payload: JsonRecord, id: string, actor: string) {
  const base = normalizeParentPayload(payload, id, true);

  if (table === "Stalker") {
    return {
      ...base,
      registryNumber: nullableString(payload.registryNumber),
      fullName: stringValue(payload.fullName).trim(),
      callsign: stringValue(payload.callsign).trim(),
      birthDate: nullableString(payload.birthDate),
      affiliation: nullableString(payload.affiliation),
      photoUrl: nullableString(payload.photoUrl),
      appearance: nullableString(payload.appearance),
      notes: nullableString(payload.notes),
      status: stringValue(payload.status) || "active",
      createdBy: actor,
    };
  }

  if (table === "Task") {
    return {
      ...base,
      assigneeType: stringValue(payload.assigneeType) || "manual",
      stalkerId: nullableString(payload.stalkerId),
      groupId: nullableString(payload.groupId),
      manualAssigneeName: nullableString(payload.manualAssigneeName),
      issuedAt: nullableString(payload.issuedAt) ?? nowIso(),
      dueAt: nullableString(payload.dueAt),
      description: stringValue(payload.description).trim(),
      reward: nullableString(payload.reward),
      notes: nullableString(payload.notes),
      issuedBy: actor,
      acceptedBy: nullableString(payload.acceptedBy),
      completedAt: nullableString(payload.completedAt),
      status: stringValue(payload.status) || "active",
    };
  }

  if (table === "Violation") {
    return {
      ...base,
      violatorType: stringValue(payload.violatorType) || "manual",
      profileId: nullableString(payload.profileId),
      manualViolatorName: nullableString(payload.manualViolatorName),
      status: stringValue(payload.status) || "active",
      closedAt: nullableString(payload.closedAt),
      closureNote: nullableString(payload.closureNote),
      date: nullableString(payload.date) ?? nowIso(),
      description: stringValue(payload.description).trim(),
      issuedBy: actor,
      notes: nullableString(payload.notes),
    };
  }

  return {
    ...base,
    createdBy: actor,
  };
}

async function handleCurrentUser(client: SupabaseClient) {
  const accessUser = await currentAccessUser(client);
  const role = stringValue(accessUser.role) as UserRole;

  return json({
    id: accessUser.id,
    login: accessUser.login,
    displayName: accessUser.displayName,
    role,
    roleLabel: getRoleLabel(role),
  });
}

async function handleSimpleCollection(
  client: SupabaseClient,
  table: string,
  method: string,
  init?: RequestInit,
  orderColumn = "createdAt",
) {
  const accessUser = await assertAuthenticated(client);

  if (method === "GET") {
    const rows = await selectRows(client, table, "*", orderColumn);
    return json(rows.map((row) => formatSimpleRow(table, row)));
  }

  if (method === "POST") {
    const payload = await requestBody(init);
    const id = stringValue(payload.id) || crypto.randomUUID();
    const actor = actorLabel(accessUser);
    const record = simpleInsertRecord(table, payload, id, actor);
    const { data, error } = await client.from(table).insert(record as never).select().single();

    if (error) {
      throw error;
    }

    return json(formatSimpleRow(table, data), 201);
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleSimpleItem(
  client: SupabaseClient,
  table: string,
  id: string,
  method: string,
  init?: RequestInit,
) {
  const accessUser = await assertAuthenticated(client);

  if (method === "PATCH") {
    const payload = await requestBody(init);
    const actor = actorLabel(accessUser);
    const patch: JsonRecord = {
      ...payload,
      updatedAt: nowIso(),
      ...(table === "Stalker" || table === "MapMarker" || table === "MapLabel" ? { updatedBy: actor } : {}),
      ...(table === "Task" && payload.status === "completed"
        ? { acceptedBy: actor, completedAt: nullableString(payload.completedAt) ?? nowIso() }
        : {}),
    };
    delete patch.id;
    delete patch.createdAt;

    for (const key of ["birthDate", "dueAt", "completedAt", "closedAt", "operationDate"]) {
      if (key in patch) {
        patch[key] = nullableString(patch[key]);
      }
    }

    const { data, error } = await client.from(table).update(patch).eq("id", id).select().single();

    if (error) {
      throw error;
    }

    return json(formatSimpleRow(table, data));
  }

  if (method === "DELETE") {
    const { data, error } = await client.from(table).delete().eq("id", id).select().single();

    if (error) {
      throw error;
    }

    return json(data);
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleGroups(client: SupabaseClient, method: string, init?: RequestInit, id?: string) {
  await assertAuthenticated(client);

  if (method === "GET" && !id) {
    return json(
      await selectRows(
        client,
        "StalkerGroup",
        "*, members:StalkerGroupMember(id, stalkerId, roleType, customRoleName, joinedAt)",
        "createdAt",
      ),
    );
  }

  if (method === "DELETE" && id) {
    const { error } = await client.from("StalkerGroup").delete().eq("id", id);
    if (error) throw error;
    return json({ id });
  }

  if ((method === "POST" && !id) || (method === "PATCH" && id)) {
    const payload = await requestBody(init);
    const groupId = id ?? (stringValue(payload.id) || crypto.randomUUID());
    const members = asArray(payload.members).map((member) => {
      const record = asRecord(member);
      return {
        id: stringValue(record.id) || crypto.randomUUID(),
        groupId,
        stalkerId: stringValue(record.stalkerId),
        roleType: stringValue(record.roleType) || "member",
        customRoleName: nullableString(record.customRoleName),
        joinedAt: stringValue(record.joinedAt) || nowIso(),
      };
    });
    const group = normalizeParentPayload(
      {
        name: stringValue(payload.name).trim(),
        photoUrl: nullableString(payload.photoUrl),
        status: stringValue(payload.status) || "active",
        notes: nullableString(payload.notes),
      },
      groupId,
      method === "POST",
    );
    const query = method === "POST" ? client.from("StalkerGroup").insert(group) : client.from("StalkerGroup").update(group).eq("id", groupId);
    const { error } = await query;
    if (error) throw error;
    await replaceChildren(client, "StalkerGroupMember", "groupId", groupId, members);
    const { data, error: readError } = await client
      .from("StalkerGroup")
      .select("*, members:StalkerGroupMember(id, stalkerId, roleType, customRoleName, joinedAt)")
      .eq("id", groupId)
      .single();
    if (readError) throw readError;
    return json(data, method === "POST" ? 201 : 200);
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleApartments(client: SupabaseClient, method: string, init?: RequestInit, id?: string) {
  const accessUser = await assertAuthenticated(client);
  const select =
    "*, tenants:ApartmentTenant(id, profileId, addedAt), payments:ApartmentPayment(id, paidAt, amount, paymentType, paymentMethod, paidUntil, notes, createdAt, acceptedBy, issuedBy, responsibleBy)";

  if (method === "GET" && !id) {
    return json(await selectRows(client, "Apartment", select, "name", true));
  }

  if (method === "DELETE" && id) {
    const { error } = await client.from("Apartment").delete().eq("id", id);
    if (error) throw error;
    return json({ id });
  }

  if ((method === "POST" && !id) || (method === "PATCH" && id)) {
    const payload = await requestBody(init);
    const apartmentId = id ?? (stringValue(payload.id) || crypto.randomUUID());
    const actor = actorLabel(accessUser);
    const tenants = asArray(payload.tenants).map((tenant) => {
      const record = asRecord(tenant);
      return {
        id: stringValue(record.id) || crypto.randomUUID(),
        apartmentId,
        profileId: stringValue(record.profileId),
        addedAt: stringValue(record.addedAt) || nowIso(),
      };
    });
    const payments = asArray(payload.payments).map((payment) => {
      const record = asRecord(payment);
      return {
        id: stringValue(record.id) || crypto.randomUUID(),
        apartmentId,
        paidAt: stringValue(record.paidAt) || nowIso(),
        amount: Number(record.amount) || 0,
        paymentType: nullableString(record.paymentType),
        paymentMethod: nullableString(record.paymentMethod),
        paidUntil: stringValue(record.paidUntil),
        notes: nullableString(record.notes),
        createdAt: stringValue(record.createdAt) || nowIso(),
        acceptedBy: nullableString(record.acceptedBy) ?? actor,
        issuedBy: nullableString(record.issuedBy) ?? actor,
        responsibleBy: nullableString(record.responsibleBy) ?? actor,
      };
    });
    const apartment = normalizeParentPayload(
      {
        name: stringValue(payload.name).trim(),
        status: tenants.length > 0 ? "occupied" : "free",
        notes: nullableString(payload.notes),
      },
      apartmentId,
      method === "POST",
    );
    const query = method === "POST" ? client.from("Apartment").insert(apartment) : client.from("Apartment").update(apartment).eq("id", apartmentId);
    const { error } = await query;
    if (error) throw error;
    await replaceChildren(client, "ApartmentTenant", "apartmentId", apartmentId, tenants);
    await replaceChildren(client, "ApartmentPayment", "apartmentId", apartmentId, payments);
    const { data, error: readError } = await client.from("Apartment").select(select).eq("id", apartmentId).single();
    if (readError) throw readError;
    return json(data, method === "POST" ? 201 : 200);
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleTradeOperations(client: SupabaseClient, method: string, init?: RequestInit, id?: string) {
  const accessUser = await assertAuthenticated(client);
  const select = "*, items:TradeOperationItem(id, name, quantity, price, notes)";

  if (method === "GET" && !id) {
    return json(await selectRows(client, "TradeOperation", select, "createdAt"));
  }

  if (method === "DELETE" && id) {
    const { error } = await client.from("TradeOperation").delete().eq("id", id);
    if (error) throw error;
    return json({ id });
  }

  if ((method === "POST" && !id) || (method === "PATCH" && id)) {
    const payload = await requestBody(init);
    const operationId = id ?? (stringValue(payload.id) || crypto.randomUUID());
    const items = asArray(payload.items).map((item) => {
      const record = asRecord(item);
      return {
        id: stringValue(record.id) || crypto.randomUUID(),
        operationId,
        name: stringValue(record.name).trim(),
        quantity: Math.max(1, Number(record.quantity) || 1),
        price: Math.max(0, Number(record.price) || 0),
        notes: nullableString(record.notes),
      };
    });
    const totalAmount = items.reduce((total, item) => total + item.quantity * item.price, 0);
    const operation = normalizeParentPayload(
      {
        type: stringValue(payload.type) || "sale",
        subjectType: stringValue(payload.subjectType) || "manual",
        stalkerId: nullableString(payload.stalkerId),
        groupId: nullableString(payload.groupId),
        manualParticipantName: nullableString(payload.manualParticipantName),
        totalAmount,
        issuedBy: actorLabel(accessUser),
        notes: nullableString(payload.notes),
        operationDate: nullableString(payload.operationDate),
      },
      operationId,
      method === "POST",
    );
    const query =
      method === "POST"
        ? client.from("TradeOperation").insert(operation)
        : client.from("TradeOperation").update(operation).eq("id", operationId);
    const { error } = await query;
    if (error) throw error;
    await replaceChildren(client, "TradeOperationItem", "operationId", operationId, items);
    const { data, error: readError } = await client.from("TradeOperation").select(select).eq("id", operationId).single();
    if (readError) throw readError;
    return json(data, method === "POST" ? 201 : 200);
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleMapOverlay(
  client: SupabaseClient,
  kind: "zone" | "route",
  method: string,
  init?: RequestInit,
  id?: string,
) {
  const accessUser = await assertAuthenticated(client);
  const table = kind === "zone" ? "MapZone" : "MapRoute";
  const pointTable = kind === "zone" ? "MapZonePoint" : "MapRoutePoint";
  const foreignKey = kind === "zone" ? "zoneId" : "routeId";
  const select = `*, points:${pointTable}(id, order, x, y)`;

  if (method === "GET" && !id) {
    return json(await selectRows(client, table, select, "createdAt"));
  }

  if (method === "DELETE" && id) {
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw error;
    return json({ id });
  }

  if ((method === "POST" && !id) || (method === "PATCH" && id)) {
    const payload = await requestBody(init);
    const parentId = id ?? (stringValue(payload.id) || crypto.randomUUID());
    const points = asArray(payload.points).map((point, index) => {
      const record = asRecord(point);
      return {
        id: stringValue(record.id) || crypto.randomUUID(),
        [foreignKey]: parentId,
        order: Number.isFinite(Number(record.order)) ? Number(record.order) : index,
        x: Number(record.x) || 0,
        y: Number(record.y) || 0,
      };
    });
    const { points: ignoredPoints, ...parentPayload } = payload;
    void ignoredPoints;
    const record = normalizeParentPayload(
      {
        ...parentPayload,
        createdBy: method === "POST" ? actorLabel(accessUser) : undefined,
        updatedBy: method === "PATCH" ? actorLabel(accessUser) : null,
      },
      parentId,
      method === "POST",
    );
    const query = method === "POST" ? client.from(table).insert(record) : client.from(table).update(record).eq("id", parentId);
    const { error } = await query;
    if (error) throw error;
    await replaceChildren(client, pointTable, foreignKey, parentId, points);
    const { data, error: readError } = await client.from(table).select(select).eq("id", parentId).single();
    if (readError) throw readError;
    return json(data, method === "POST" ? 201 : 200);
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleMapLayers(client: SupabaseClient, method: string, init?: RequestInit, id?: string) {
  await assertAuthenticated(client);

  if (method === "GET") {
    return json(await selectRows(client, "MapLayer", "*", "name", true));
  }

  if (method === "POST") {
    const payload = await requestBody(init);
    const name = stringValue(payload.name).trim();
    const timestamp = nowIso();
    const { data, error } = await client
      .from("MapLayer")
      .insert({
        id: crypto.randomUUID(),
        name,
        normalizedName: normalizeLogin(name),
        isDefault: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .select()
      .single();
    if (error) throw error;
    return json(data, 201);
  }

  if (method === "PATCH" && id) {
    const payload = await requestBody(init);
    const name = stringValue(payload.name).trim();
    const { data, error } = await client
      .from("MapLayer")
      .update({ name, normalizedName: normalizeLogin(name), updatedAt: nowIso() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return json(data);
  }

  if (method === "DELETE" && id) {
    const { error } = await client.from("MapLayer").delete().eq("id", id).eq("isDefault", false);
    if (error) throw error;
    return json({ id });
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleCalculatorCatalog(client: SupabaseClient) {
  await assertAuthenticated(client);
  const categories = await selectRows(
    client,
    "SupplyCatalogCategory",
    "id, name, sortOrder, items:SupplyCatalogItem(id, kind, name, contents, traderPrice, basePrice, generalPrice, partnerPrice, tenantPrice, note, isActive, sortOrder)",
    "sortOrder",
    true,
  );

  return json({
    categories: categories.map((category) => {
      const record = asRecord(category);
      return {
        id: record.id,
        name: record.name,
        items: asArray(record.items)
          .map(asRecord)
          .filter((item) => item.isActive !== false)
          .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder)),
      };
    }),
  });
}

async function handleDutyMembers(client: SupabaseClient, method: string, init?: RequestInit, id?: string) {
  const accessUser = await assertAuthenticated(client);
  const select =
    "*, accessUser:AccessUser(id, login, displayName, role, isActive), staffPositions:DutyStaffPosition(id, title, sortOrder, section:DutyStaffSection(id, name, sortOrder))";

  if (method === "GET" && !id) {
    const rows = await selectRows(client, "DutyMember", select, "createdAt");
    return json(
      rows.map((row) => {
        const member = asRecord(row);
        const memberAccess = asRecord(member.accessUser);
        return {
          ...member,
          positions: asArray(member.staffPositions).map((position) => {
            const positionRecord = asRecord(position);
            const section = asRecord(positionRecord.section);
            return {
              id: positionRecord.id,
              title: positionRecord.title,
              sectionId: section.id,
              sectionName: section.name,
              sortOrder: positionRecord.sortOrder,
            };
          }),
          access: member.accessUser
            ? {
                login: memberAccess.login,
                displayName: memberAccess.displayName,
                role: memberAccess.role,
                roleLabel: getRoleLabel(stringValue(memberAccess.role) as UserRole),
                isActive: memberAccess.isActive,
                password: null,
              }
            : null,
        };
      }),
    );
  }

  if (method === "PATCH" && id) {
    const payload = await requestBody(init);
    const { data, error } = await client
      .from("DutyMember")
      .update({ ...payload, updatedAt: nowIso() })
      .eq("id", id)
      .select(select)
      .single();
    if (error) throw error;
    return json(data);
  }

  if (method === "DELETE" && id) {
    const { error } = await client.from("DutyMember").delete().eq("id", id);
    if (error) throw error;
    return json({ id });
  }

  if (method === "POST") {
    return errorResponse(blockedAdminMessage, 501);
  }

  if (method === "PATCH" && id?.endsWith("/access")) {
    void accessUser;
  }

  return errorResponse("Метод не поддерживается.", 405);
}

async function handleAccessUsers(client: SupabaseClient) {
  await assertAuthenticated(client);
  return json(
    await selectRows(client, "AccessUser", "id, login, displayName, role, isActive", "login", true),
  );
}

async function handleStaffList(client: SupabaseClient) {
  await assertAuthenticated(client);
  const sections = await selectRows(
    client,
    "DutyStaffSection",
    "*, positions:DutyStaffPosition(*, dutyMember:DutyMember(id, fullName, callsign, rank, serviceStatus, accessUser:AccessUser(login, displayName, role, isActive)))",
    "sortOrder",
    true,
  );

  return json(
    sections.map((section) => {
      const sectionRecord = asRecord(section);
      return {
        ...sectionRecord,
        positions: asArray(sectionRecord.positions)
          .map((position) => {
            const positionRecord = asRecord(position);
            const member = asRecord(positionRecord.dutyMember);
            const memberAccess = asRecord(member.accessUser);
            return {
              id: positionRecord.id,
              title: positionRecord.title,
              sortOrder: positionRecord.sortOrder,
              assignedAt: positionRecord.assignedAt,
              assignedBy: positionRecord.assignedBy,
              updatedBy: positionRecord.updatedBy,
              member: positionRecord.dutyMember
                ? {
                    id: member.id,
                    fullName: member.fullName,
                    callsign: member.callsign,
                    rank: member.rank,
                    serviceStatus: member.serviceStatus,
                    access: member.accessUser
                      ? {
                          ...memberAccess,
                          roleLabel: getRoleLabel(stringValue(memberAccess.role) as UserRole),
                        }
                      : null,
                  }
                : null,
            };
          })
          .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder)),
      };
    }),
  );
}

async function handleNotes(
  client: SupabaseClient,
  profileId: string,
  method: string,
  init?: RequestInit,
  noteId?: string,
) {
  const accessUser = await assertAuthenticated(client);

  if (method === "GET") {
    const { data, error } = await client.from("StalkerNote").select("*").eq("stalkerId", profileId).order("createdAt");
    if (error) throw error;
    return json(data ?? []);
  }

  if (method === "POST") {
    const payload = await requestBody(init);
    const timestamp = nowIso();
    const { data, error } = await client
      .from("StalkerNote")
      .insert({
        id: crypto.randomUUID(),
        stalkerId: profileId,
        text: stringValue(payload.text).trim(),
        createdBy: actorLabel(accessUser),
        createdByAccessUserId: accessUser.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .select()
      .single();
    if (error) throw error;
    return json(data, 201);
  }

  if (method === "PATCH" && noteId) {
    const payload = await requestBody(init);
    const { data, error } = await client
      .from("StalkerNote")
      .update({ text: stringValue(payload.text).trim(), updatedBy: actorLabel(accessUser), updatedAt: nowIso() })
      .eq("id", noteId)
      .eq("stalkerId", profileId)
      .select()
      .single();
    if (error) throw error;
    return json(data);
  }

  if (method === "DELETE" && noteId) {
    const { error } = await client.from("StalkerNote").delete().eq("id", noteId).eq("stalkerId", profileId);
    if (error) throw error;
    return json({ id: noteId });
  }

  return errorResponse("Метод не поддерживается.", 405);
}

export function shouldUseStaticSupabaseApi(input: RequestInfo | URL) {
  if (!staticExportEnabled || typeof window === "undefined") {
    return false;
  }

  const value = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return value.startsWith("/api/");
}

export async function staticSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const url = new URL(rawUrl, window.location.origin);
  const path = url.pathname.replace(/^.*?\/api\//, "/api/");
  const method = (init?.method ?? "GET").toUpperCase();
  const client = createSupabaseBrowserClient();

  try {
    if (path === "/api/auth/me") return await handleCurrentUser(client);
    if (path === "/api/calculator/catalog") return await handleCalculatorCatalog(client);
    if (path === "/api/duty-members/access-users") return await handleAccessUsers(client);
    if (path === "/api/duty-members/staff-list") return await handleStaffList(client);
    if (path.startsWith("/api/duty-members/staff-list/positions")) {
      return errorResponse(blockedAdminMessage, 501);
    }
    if (path === "/api/duty-members/users" || path.endsWith("/password") || path === "/api/duty-members/password") {
      return errorResponse(blockedAdminMessage, 501);
    }
    if (/^\/api\/duty-members\/[^/]+\/access$/.test(path)) {
      return errorResponse(blockedAdminMessage, 501);
    }
    if (path.endsWith("/import") || path === "/api/apartments/defaults") {
      return errorResponse(
        "Массовый импорт и автоматическое создание записей требуют транзакционного серверного обработчика.",
        501,
      );
    }

    const notesMatch = path.match(/^\/api\/stalkers\/([^/]+)\/notes(?:\/([^/]+))?$/);
    if (notesMatch) return await handleNotes(client, decodeURIComponent(notesMatch[1]), method, init, notesMatch[2] ? decodeURIComponent(notesMatch[2]) : undefined);

    const routes: Array<[RegExp, string]> = [
      [/^\/api\/stalkers(?:\/([^/]+))?$/, "Stalker"],
      [/^\/api\/tasks(?:\/([^/]+))?$/, "Task"],
      [/^\/api\/violations(?:\/([^/]+))?$/, "Violation"],
      [/^\/api\/map-markers(?:\/([^/]+))?$/, "MapMarker"],
      [/^\/api\/map-labels(?:\/([^/]+))?$/, "MapLabel"],
    ];

    for (const [pattern, table] of routes) {
      const match = path.match(pattern);
      if (match) {
        const id = match[1] ? decodeURIComponent(match[1]) : undefined;
        return id
          ? await handleSimpleItem(client, table, id, method, init)
          : await handleSimpleCollection(client, table, method, init, table === "Task" ? "issuedAt" : table === "Violation" ? "date" : "createdAt");
      }
    }

    const groupMatch = path.match(/^\/api\/stalker-groups(?:\/([^/]+))?$/);
    if (groupMatch) return await handleGroups(client, method, init, groupMatch[1] ? decodeURIComponent(groupMatch[1]) : undefined);

    const apartmentMatch = path.match(/^\/api\/apartments(?:\/([^/]+))?$/);
    if (apartmentMatch) return await handleApartments(client, method, init, apartmentMatch[1] ? decodeURIComponent(apartmentMatch[1]) : undefined);

    const tradeMatch = path.match(/^\/api\/trade-operations(?:\/([^/]+))?$/);
    if (tradeMatch) return await handleTradeOperations(client, method, init, tradeMatch[1] ? decodeURIComponent(tradeMatch[1]) : undefined);

    const zoneMatch = path.match(/^\/api\/map-zones(?:\/([^/]+))?$/);
    if (zoneMatch) return await handleMapOverlay(client, "zone", method, init, zoneMatch[1] ? decodeURIComponent(zoneMatch[1]) : undefined);

    const routeMatch = path.match(/^\/api\/map-routes(?:\/([^/]+))?$/);
    if (routeMatch) return await handleMapOverlay(client, "route", method, init, routeMatch[1] ? decodeURIComponent(routeMatch[1]) : undefined);

    const layerMatch = path.match(/^\/api\/map-layers(?:\/([^/]+))?$/);
    if (layerMatch) return await handleMapLayers(client, method, init, layerMatch[1] ? decodeURIComponent(layerMatch[1]) : undefined);

    const dutyMemberMatch = path.match(/^\/api\/duty-members(?:\/([^/]+))?$/);
    if (dutyMemberMatch) return await handleDutyMembers(client, method, init, dutyMemberMatch[1] ? decodeURIComponent(dutyMemberMatch[1]) : undefined);

    return errorResponse("Этот API-маршрут не адаптирован для статического хостинга.", 501);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить операцию через Supabase.";
    return errorResponse(message, message.includes("вход") ? 401 : 400);
  }
}
