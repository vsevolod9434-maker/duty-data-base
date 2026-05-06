import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createErrorResponse,
  isViolationStatus,
  mapViolationToResponse,
  normalizeNullableString,
  normalizeString,
  normalizeViolationSubject,
  parseNullableDate,
  parseStoredDate,
  type ViolationPayload,
} from "../violation-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as unknown;

  if (!Array.isArray(payload)) {
    return createErrorResponse("Для импорта передан не список нарушений.");
  }

  const prisma = getPrismaClient();
  const stalkers = await prisma.stalker.findMany({ select: { id: true } });
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
  const now = createSystemDate();
  let skippedLinks = 0;

  const candidates = payload
    .filter((item): item is ViolationPayload & { id: string } => {
      return Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string";
    })
    .map((violation) => {
      const description = normalizeString(violation.description);

      if (!description) {
        return null;
      }

      const subject = normalizeViolationSubject(violation, existingStalkerIds);

      if (subject.skippedLink) {
        skippedLinks += 1;
      }

      const createdAt = parseStoredDate(violation.createdAt, now);
      const updatedAt = parseStoredDate(violation.updatedAt, createdAt);

      return {
        id: violation.id,
        violatorType: subject.violatorType,
        profileId: subject.profileId,
        manualViolatorName: subject.manualViolatorName,
        status: isViolationStatus(violation.status) ? violation.status : "active",
        closedAt: parseNullableDate(violation.closedAt),
        closureNote: normalizeNullableString(violation.closureNote),
        date: parseStoredDate(violation.date, createdAt),
        description,
        issuedBy: normalizeNullableString(violation.issuedBy),
        notes: normalizeNullableString(violation.notes),
        createdAt,
        updatedAt,
      };
    })
    .filter((violation): violation is NonNullable<typeof violation> => Boolean(violation));

  if (candidates.length === 0) {
    return createErrorResponse("В переданном списке нет нарушений, пригодных для импорта.");
  }

  await prisma.$transaction(
    candidates.map((violation) =>
      prisma.violation.upsert({
        create: violation,
        update: {
          violatorType: violation.violatorType,
          profileId: violation.profileId,
          manualViolatorName: violation.manualViolatorName,
          status: violation.status,
          closedAt: violation.closedAt,
          closureNote: violation.closureNote,
          date: violation.date,
          description: violation.description,
          issuedBy: violation.issuedBy,
          notes: violation.notes,
          updatedAt: violation.updatedAt,
        },
        where: { id: violation.id },
      }),
    ),
  );

  const violations = await prisma.violation.findMany({
    orderBy: { date: "desc" },
  });

  return Response.json({
    violations: violations.map(mapViolationToResponse),
    skippedLinks,
  });
}
