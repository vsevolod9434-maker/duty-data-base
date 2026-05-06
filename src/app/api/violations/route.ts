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
} from "./violation-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();
  const violations = await prisma.violation.findMany({
    orderBy: { date: "desc" },
  });

  return Response.json(violations.map(mapViolationToResponse));
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as ViolationPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные нарушения.");
  }

  if (payload.status !== undefined && !isViolationStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус нарушения.");
  }

  const description = normalizeString(payload.description);

  if (!description) {
    return createErrorResponse("Укажите описание нарушения.");
  }

  const prisma = getPrismaClient();
  const stalkers = await prisma.stalker.findMany({ select: { id: true } });
  const subject = normalizeViolationSubject(payload, new Set(stalkers.map((stalker) => stalker.id)));
  const now = createSystemDate();
  const violation = await prisma.violation.create({
    data: {
      id: crypto.randomUUID(),
      violatorType: subject.violatorType,
      profileId: subject.profileId,
      manualViolatorName: subject.manualViolatorName,
      status: isViolationStatus(payload.status) ? payload.status : "active",
      closedAt: parseNullableDate(payload.closedAt),
      closureNote: normalizeNullableString(payload.closureNote),
      date: parseStoredDate(payload.date, now),
      description,
      issuedBy: normalizeNullableString(payload.issuedBy),
      notes: normalizeNullableString(payload.notes),
      createdAt: now,
      updatedAt: now,
    },
  });

  return Response.json(mapViolationToResponse(violation), { status: 201 });
}
