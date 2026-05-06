import type { TradeSubjectType, TradeType } from "@/lib/types";

const tradeTypes = ["sale", "purchase"] as const satisfies readonly TradeType[];
const tradeSubjectTypes = ["stalker", "group", "manual"] as const satisfies readonly TradeSubjectType[];

export type TradeOperationItemPayload = {
  id?: unknown;
  name?: unknown;
  quantity?: unknown;
  price?: unknown;
  notes?: unknown;
};

export type TradeOperationPayload = {
  id?: unknown;
  type?: unknown;
  subjectType?: unknown;
  stalkerId?: unknown;
  groupId?: unknown;
  manualParticipantName?: unknown;
  items?: unknown;
  totalAmount?: unknown;
  issuedBy?: unknown;
  notes?: unknown;
  operationDate?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type DatabaseTradeOperation = {
  id: string;
  type: TradeType;
  subjectType: TradeSubjectType;
  stalkerId: string | null;
  groupId: string | null;
  manualParticipantName: string | null;
  totalAmount: number;
  issuedBy: string | null;
  notes: string | null;
  operationDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    notes: string | null;
  }>;
};

export function createErrorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isTradeType(value: unknown): value is TradeType {
  return typeof value === "string" && tradeTypes.includes(value as TradeType);
}

export function isTradeSubjectType(value: unknown): value is TradeSubjectType {
  return typeof value === "string" && tradeSubjectTypes.includes(value as TradeSubjectType);
}

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNullableString(value: unknown) {
  const normalizedValue = normalizeString(value);
  return normalizedValue || null;
}

export function parseNullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function parseStoredDate(value: unknown, fallback: Date) {
  const parsedDate = parseNullableDate(value);
  return parsedDate ?? fallback;
}

export function normalizeTradeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): Array<{ id: string; name: string; quantity: number; price: number; notes: string | null }> => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as TradeOperationItemPayload;
    const name = normalizeString(candidate.name);

    if (!name) {
      return [];
    }

    const quantity = typeof candidate.quantity === "number" && Number.isFinite(candidate.quantity) ? Math.trunc(candidate.quantity) : 1;
    const price = typeof candidate.price === "number" && Number.isFinite(candidate.price) ? Math.trunc(candidate.price) : 0;

    return [
      {
        id: normalizeString(candidate.id) || crypto.randomUUID(),
        name,
        quantity: Math.max(1, quantity),
        price: Math.max(0, price),
        notes: normalizeNullableString(candidate.notes),
      },
    ];
  });
}

export function calculateTotalAmount(items: Array<{ quantity: number; price: number }>) {
  return items.reduce((total, item) => total + item.quantity * item.price, 0);
}

export function normalizeTradeSubject(
  payload: TradeOperationPayload,
  existingStalkerIds: Set<string>,
  existingGroupIds: Set<string>,
) {
  const requestedSubjectType = isTradeSubjectType(payload.subjectType) ? payload.subjectType : "manual";
  const stalkerId = normalizeString(payload.stalkerId);
  const groupId = normalizeString(payload.groupId);
  const manualParticipantName = normalizeNullableString(payload.manualParticipantName);

  if (requestedSubjectType === "stalker" && stalkerId && existingStalkerIds.has(stalkerId)) {
    return {
      subjectType: "stalker" as const,
      stalkerId,
      groupId: null,
      manualParticipantName: null,
      skippedLink: false,
    };
  }

  if (requestedSubjectType === "group" && groupId && existingGroupIds.has(groupId)) {
    return {
      subjectType: "group" as const,
      stalkerId: null,
      groupId,
      manualParticipantName: null,
      skippedLink: false,
    };
  }

  return {
    subjectType: "manual" as const,
    stalkerId: null,
    groupId: null,
    manualParticipantName: manualParticipantName ?? (stalkerId || groupId || null),
    skippedLink: requestedSubjectType !== "manual",
  };
}

export function mapTradeOperationToResponse(operation: DatabaseTradeOperation) {
  return {
    id: operation.id,
    type: operation.type,
    subjectType: operation.subjectType,
    stalkerId: operation.stalkerId,
    groupId: operation.groupId,
    manualParticipantName: operation.manualParticipantName,
    items: operation.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      notes: item.notes,
    })),
    totalAmount: operation.totalAmount,
    issuedBy: operation.issuedBy,
    notes: operation.notes,
    operationDate: operation.operationDate ? operation.operationDate.toISOString() : null,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString(),
  };
}
