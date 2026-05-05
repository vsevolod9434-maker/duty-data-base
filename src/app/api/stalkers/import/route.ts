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
  parseStoredDate,
  type StalkerPayload,
} from "../stalker-route-utils";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as unknown;

  if (!Array.isArray(payload)) {
    return createErrorResponse("Для импорта передан не список профилей.");
  }

  const now = createSystemDate();
  const candidates = payload
    .filter((item): item is StalkerPayload & { id: string } => {
      return Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string";
    })
    .map((profile) => {
      const callsign = normalizeRequiredString(profile.callsign);
      const fullName = normalizeRequiredString(profile.fullName) || callsign || "Без имени";
      const createdAt = parseStoredDate(profile.createdAt, now);
      const updatedAt = parseStoredDate(profile.updatedAt, createdAt);

      return {
        id: profile.id,
        registryNumber: normalizeNullableString(profile.registryNumber),
        fullName,
        callsign,
        birthDate: parseNullableDate(profile.birthDate),
        affiliation: isStalkerAffiliation(profile.affiliation) ? profile.affiliation : null,
        photoUrl: normalizeNullableString(profile.photoUrl),
        appearance: normalizeNullableString(profile.appearance),
        notes: normalizeNullableString(profile.notes),
        status: isStalkerProfileStatus(profile.status) ? profile.status : "active",
        createdAt,
        updatedAt,
        createdBy: normalizeNullableString(profile.createdBy),
        updatedBy: normalizeNullableString(profile.updatedBy),
      };
    });

  if (candidates.length === 0) {
    return createErrorResponse("В локальном списке нет профилей, пригодных для импорта.");
  }

  const prisma = getPrismaClient();

  await prisma.$transaction(
    candidates.map((profile) =>
      prisma.stalker.upsert({
        create: profile,
        update: {
          registryNumber: profile.registryNumber,
          fullName: profile.fullName,
          callsign: profile.callsign,
          birthDate: profile.birthDate,
          affiliation: profile.affiliation,
          photoUrl: profile.photoUrl,
          appearance: profile.appearance,
          notes: profile.notes,
          status: profile.status,
          createdBy: profile.createdBy,
          updatedBy: profile.updatedBy,
          updatedAt: profile.updatedAt,
        },
        where: { id: profile.id },
      }),
    ),
  );

  const stalkers = await prisma.stalker.findMany({
    orderBy: [{ createdAt: "desc" }, { fullName: "asc" }],
  });

  return Response.json(stalkers.map(mapStalkerToProfile));
}
