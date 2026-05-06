import type { ViolationSubjectType } from "@/lib/types";

type ViolationStatus = "active" | "closed";

const violationSubjectTypes = ["profile", "manual"] as const satisfies readonly ViolationSubjectType[];
const violationStatuses = ["active", "closed"] as const satisfies readonly ViolationStatus[];

export type ViolationPayload = {
  id?: unknown;
  violatorType?: unknown;
  profileId?: unknown;
  manualViolatorName?: unknown;
  status?: unknown;
  closedAt?: unknown;
  closureNote?: unknown;
  date?: unknown;
  description?: unknown;
  issuedBy?: unknown;
  notes?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type DatabaseViolation = {
  id: string;
  violatorType: ViolationSubjectType;
  profileId: string | null;
  manualViolatorName: string | null;
  status: ViolationStatus;
  closedAt: Date | null;
  closureNote: string | null;
  date: Date;
  description: string;
  issuedBy: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function createErrorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isViolationSubjectType(value: unknown): value is ViolationSubjectType {
  return typeof value === "string" && violationSubjectTypes.includes(value as ViolationSubjectType);
}

export function isViolationStatus(value: unknown): value is ViolationStatus {
  return typeof value === "string" && violationStatuses.includes(value as ViolationStatus);
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

export function normalizeViolationSubject(payload: ViolationPayload, existingStalkerIds: Set<string>) {
  const requestedViolatorType = isViolationSubjectType(payload.violatorType) ? payload.violatorType : "manual";
  const profileId = normalizeString(payload.profileId);
  const manualViolatorName = normalizeNullableString(payload.manualViolatorName);

  if (requestedViolatorType === "profile" && profileId && existingStalkerIds.has(profileId)) {
    return {
      violatorType: "profile" as const,
      profileId,
      manualViolatorName: null,
      skippedLink: false,
    };
  }

  return {
    violatorType: "manual" as const,
    profileId: null,
    manualViolatorName: manualViolatorName ?? (profileId || null),
    skippedLink: requestedViolatorType !== "manual",
  };
}

export function mapViolationToResponse(violation: DatabaseViolation) {
  return {
    id: violation.id,
    violatorType: violation.violatorType,
    profileId: violation.profileId,
    manualViolatorName: violation.manualViolatorName,
    status: violation.status,
    closedAt: violation.closedAt ? violation.closedAt.toISOString() : null,
    closureNote: violation.closureNote,
    date: violation.date.toISOString(),
    description: violation.description,
    issuedBy: violation.issuedBy,
    notes: violation.notes,
    createdAt: violation.createdAt.toISOString(),
    updatedAt: violation.updatedAt.toISOString(),
  };
}
