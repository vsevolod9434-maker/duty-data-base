import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createErrorResponse,
  isStalkerAffiliation,
  isStalkerProfileStatus,
  mapStalkerToProfile,
  normalizeNullableString,
  normalizeRequiredString,
  parseNullableDate,
  type StalkerPayload,
} from "./stalker-route-utils";

export async function GET() {
  const prisma = getPrismaClient();
  const stalkers = await prisma.stalker.findMany({
    orderBy: [{ createdAt: "desc" }, { fullName: "asc" }],
  });

  return Response.json(stalkers.map(mapStalkerToProfile));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as StalkerPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные профиля.");
  }

  const fullName = normalizeRequiredString(payload.fullName);

  if (!fullName) {
    return createErrorResponse("Укажите ФИО сталкера.");
  }

  if (payload.status !== undefined && !isStalkerProfileStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус профиля.");
  }

  if (payload.affiliation !== undefined && payload.affiliation !== null && payload.affiliation !== "" && !isStalkerAffiliation(payload.affiliation)) {
    return createErrorResponse("Указана некорректная принадлежность.");
  }

  const now = createSystemDate();
  const prisma = getPrismaClient();
  const stalker = await prisma.stalker.create({
    data: {
      id: crypto.randomUUID(),
      registryNumber: normalizeNullableString(payload.registryNumber),
      fullName,
      callsign: normalizeRequiredString(payload.callsign),
      birthDate: parseNullableDate(payload.birthDate),
      affiliation: isStalkerAffiliation(payload.affiliation) ? payload.affiliation : null,
      photoUrl: normalizeNullableString(payload.photoUrl),
      appearance: normalizeNullableString(payload.appearance),
      notes: normalizeNullableString(payload.notes),
      status: isStalkerProfileStatus(payload.status) ? payload.status : "active",
      createdAt: now,
      updatedAt: now,
      createdBy: normalizeNullableString(payload.createdBy),
      updatedBy: normalizeNullableString(payload.updatedBy),
    },
  });

  return Response.json(mapStalkerToProfile(stalker), { status: 201 });
}
