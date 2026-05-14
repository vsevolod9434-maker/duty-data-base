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
  type ViolationPayload,
} from "../violation-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isNotFoundError(error: unknown) {
  return error !== null && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2025";
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as ViolationPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные нарушения.");
  }

  if (payload.status !== undefined && !isViolationStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус нарушения.");
  }

  try {
    const prisma = getPrismaClient();
    const currentViolation = await prisma.violation.findUniqueOrThrow({ where: { id } });
    const data: {
      violatorType?: "profile" | "manual";
      profileId?: string | null;
      manualViolatorName?: string | null;
      status?: "active" | "closed";
      closedAt?: Date | null;
      closureNote?: string | null;
      date?: Date;
      description?: string;
      notes?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: createSystemDate(),
    };

    if (payload.violatorType !== undefined || payload.profileId !== undefined || payload.manualViolatorName !== undefined) {
      const stalkers = await prisma.stalker.findMany({ select: { id: true } });
      const subject = normalizeViolationSubject(
        {
          violatorType: payload.violatorType ?? currentViolation.violatorType,
          profileId: payload.profileId ?? currentViolation.profileId,
          manualViolatorName: payload.manualViolatorName ?? currentViolation.manualViolatorName,
        },
        new Set(stalkers.map((stalker) => stalker.id)),
      );

      data.violatorType = subject.violatorType;
      data.profileId = subject.profileId;
      data.manualViolatorName = subject.manualViolatorName;
    }

    if (isViolationStatus(payload.status)) {
      data.status = payload.status;
    }

    if (payload.closedAt !== undefined) {
      data.closedAt = parseNullableDate(payload.closedAt);
    }

    if (payload.closureNote !== undefined) {
      data.closureNote = normalizeNullableString(payload.closureNote);
    }

    if (payload.date !== undefined) {
      const date = parseNullableDate(payload.date);

      if (!date) {
        return createErrorResponse("Укажите дату нарушения.");
      }

      data.date = date;
    }

    if (payload.description !== undefined) {
      const description = normalizeString(payload.description);

      if (!description) {
        return createErrorResponse("Укажите описание нарушения.");
      }

      data.description = description;
    }

    if (payload.notes !== undefined) {
      data.notes = normalizeNullableString(payload.notes);
    }

    const violation = await prisma.violation.update({
      data,
      where: { id },
    });

    return Response.json(mapViolationToResponse(violation));
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Нарушение не найдено.", 404);
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    const prisma = getPrismaClient();
    await prisma.violation.delete({ where: { id } });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Нарушение не найдено.", 404);
    }

    throw error;
  }
}
