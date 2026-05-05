import type { Stalker as DatabaseStalker } from "@/generated/prisma/client";
import type { StalkerAffiliation, StalkerProfileStatus } from "@/lib/types";

const stalkerAffiliations = [
  "loner",
  "duty",
  "freedom",
  "gopnik",
  "bandit",
  "mercenary",
  "military",
  "clear_sky",
] as const satisfies readonly StalkerAffiliation[];

const stalkerProfileStatuses = ["active", "archive"] as const satisfies readonly StalkerProfileStatus[];

export type StalkerPayload = {
  registryNumber?: unknown;
  fullName?: unknown;
  callsign?: unknown;
  birthDate?: unknown;
  affiliation?: unknown;
  photoUrl?: unknown;
  appearance?: unknown;
  notes?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: unknown;
  updatedBy?: unknown;
};

export function createErrorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function mapStalkerToProfile(stalker: DatabaseStalker) {
  return {
    id: stalker.id,
    registryNumber: stalker.registryNumber,
    fullName: stalker.fullName,
    callsign: stalker.callsign,
    birthDate: stalker.birthDate ? stalker.birthDate.toISOString() : null,
    affiliation: stalker.affiliation,
    photoUrl: stalker.photoUrl,
    appearance: stalker.appearance,
    notes: stalker.notes,
    status: stalker.status,
    taskMark: "none",
    createdAt: stalker.createdAt.toISOString(),
    updatedAt: stalker.updatedAt.toISOString(),
    createdBy: stalker.createdBy,
    updatedBy: stalker.updatedBy,
  };
}

export function isStalkerAffiliation(value: unknown): value is StalkerAffiliation {
  return typeof value === "string" && stalkerAffiliations.includes(value as StalkerAffiliation);
}

export function isStalkerProfileStatus(value: unknown): value is StalkerProfileStatus {
  return typeof value === "string" && stalkerProfileStatuses.includes(value as StalkerProfileStatus);
}

export function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue || null;
}

export function normalizeRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
