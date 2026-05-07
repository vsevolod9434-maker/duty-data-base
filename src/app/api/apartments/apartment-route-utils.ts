import type { ApartmentPaymentType, ApartmentStatus } from "@/generated/prisma/client";

const apartmentStatuses = ["free", "occupied"] as const satisfies readonly ApartmentStatus[];
const apartmentPaymentTypes = ["money", "other"] as const satisfies readonly ApartmentPaymentType[];

export type ApartmentTenantPayload = {
  id?: unknown;
  profileId?: unknown;
  addedAt?: unknown;
};

export type ApartmentPaymentPayload = {
  id?: unknown;
  paidAt?: unknown;
  amount?: unknown;
  paymentType?: unknown;
  paymentMethod?: unknown;
  paidUntil?: unknown;
  notes?: unknown;
  createdAt?: unknown;
  acceptedBy?: unknown;
  issuedBy?: unknown;
  responsibleBy?: unknown;
};

export type ApartmentPayload = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  notes?: unknown;
  tenants?: unknown;
  payments?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type DatabaseApartment = {
  id: string;
  name: string;
  status: ApartmentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenants: Array<{
    id: string;
    profileId: string;
    addedAt: Date;
  }>;
  payments: Array<{
    id: string;
    paidAt: Date;
    amount: number;
    paymentType: ApartmentPaymentType | null;
    paymentMethod: string | null;
    paidUntil: Date;
    notes: string | null;
    createdAt: Date;
    acceptedBy: string | null;
    issuedBy: string | null;
    responsibleBy: string | null;
  }>;
};

export const apartmentResponseInclude = {
  tenants: {
    orderBy: { addedAt: "asc" },
    select: {
      id: true,
      profileId: true,
      addedAt: true,
    },
  },
  payments: {
    orderBy: { paidAt: "desc" },
    select: {
      id: true,
      paidAt: true,
      amount: true,
      paymentType: true,
      paymentMethod: true,
      paidUntil: true,
      notes: true,
      createdAt: true,
      acceptedBy: true,
      issuedBy: true,
      responsibleBy: true,
    },
  },
} as const;

export function createErrorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isApartmentStatus(value: unknown): value is ApartmentStatus {
  return typeof value === "string" && apartmentStatuses.includes(value as ApartmentStatus);
}

export function isApartmentPaymentType(value: unknown): value is ApartmentPaymentType {
  return typeof value === "string" && apartmentPaymentTypes.includes(value as ApartmentPaymentType);
}

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue || null;
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

export function getOccupancyStatus(tenantCount: number): ApartmentStatus {
  return tenantCount > 0 ? "occupied" : "free";
}

export function mapApartmentToResponse(apartment: DatabaseApartment) {
  return {
    id: apartment.id,
    name: apartment.name,
    status: apartment.status,
    tenants: apartment.tenants.map((tenant) => ({
      id: tenant.id,
      profileId: tenant.profileId,
      addedAt: tenant.addedAt.toISOString(),
    })),
    payments: apartment.payments.map((payment) => ({
      id: payment.id,
      paidAt: payment.paidAt.toISOString(),
      amount: payment.amount,
      paymentType: payment.paymentType,
      paymentMethod: payment.paymentMethod,
      paidUntil: payment.paidUntil.toISOString(),
      notes: payment.notes,
      createdAt: payment.createdAt.toISOString(),
      acceptedBy: payment.acceptedBy,
      issuedBy: payment.issuedBy,
      responsibleBy: payment.responsibleBy,
    })),
    notes: apartment.notes,
    createdAt: apartment.createdAt.toISOString(),
    updatedAt: apartment.updatedAt.toISOString(),
  };
}

export function normalizeTenantPayloads(value: unknown, existingStalkerIds: Set<string>, fallbackDate: Date) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenProfileIds = new Set<string>();

  return value.flatMap((tenant): Array<{ id: string; profileId: string; addedAt: Date }> => {
    if (!tenant || typeof tenant !== "object") {
      return [];
    }

    const candidate = tenant as ApartmentTenantPayload;
    const profileId = normalizeString(candidate.profileId);

    if (!profileId || !existingStalkerIds.has(profileId) || seenProfileIds.has(profileId)) {
      return [];
    }

    seenProfileIds.add(profileId);

    return [
      {
        id: normalizeString(candidate.id) || crypto.randomUUID(),
        profileId,
        addedAt: parseStoredDate(candidate.addedAt, fallbackDate),
      },
    ];
  });
}

export function normalizePaymentPayloads(value: unknown, fallbackDate: Date) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((payment): Array<{
    id: string;
    paidAt: Date;
    amount: number;
    paymentType: ApartmentPaymentType | null;
    paymentMethod: string | null;
    paidUntil: Date;
    notes: string | null;
    createdAt: Date;
    acceptedBy: string | null;
    issuedBy: string | null;
    responsibleBy: string | null;
  }> => {
    if (!payment || typeof payment !== "object") {
      return [];
    }

    const candidate = payment as ApartmentPaymentPayload;
    const paidAt = parseNullableDate(candidate.paidAt);
    const paidUntil = parseNullableDate(candidate.paidUntil);

    if (!paidAt || !paidUntil) {
      return [];
    }

    const amount = typeof candidate.amount === "number" && Number.isFinite(candidate.amount) ? Math.trunc(candidate.amount) : 0;
    const paymentType = isApartmentPaymentType(candidate.paymentType) ? candidate.paymentType : null;

    return [
      {
        id: normalizeString(candidate.id) || crypto.randomUUID(),
        paidAt,
        amount,
        paymentType,
        paymentMethod: normalizeNullableString(candidate.paymentMethod),
        paidUntil,
        notes: normalizeNullableString(candidate.notes),
        createdAt: parseStoredDate(candidate.createdAt, fallbackDate),
        acceptedBy: normalizeNullableString(candidate.acceptedBy),
        issuedBy: normalizeNullableString(candidate.issuedBy),
        responsibleBy: normalizeNullableString(candidate.responsibleBy),
      },
    ];
  });
}
