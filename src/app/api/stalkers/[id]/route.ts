import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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
} from "../stalker-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isNotFoundError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as StalkerPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные профиля.");
  }

  if (payload.status !== undefined && !isStalkerProfileStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус профиля.");
  }

  if (payload.affiliation !== undefined && payload.affiliation !== null && payload.affiliation !== "" && !isStalkerAffiliation(payload.affiliation)) {
    return createErrorResponse("Указана некорректная принадлежность.");
  }

  const data: Prisma.StalkerUpdateInput = {
    updatedAt: createSystemDate(),
  };

  if (payload.registryNumber !== undefined) {
    data.registryNumber = normalizeNullableString(payload.registryNumber);
  }

  const currentProfile =
    payload.fullName !== undefined || payload.callsign !== undefined
      ? await getPrismaClient().stalker.findUnique({
          select: {
            fullName: true,
            callsign: true,
          },
          where: { id },
        })
      : null;

  if ((payload.fullName !== undefined || payload.callsign !== undefined) && !currentProfile) {
    return createErrorResponse("Профиль сталкера не найден.", 404);
  }

  if (payload.fullName !== undefined) {
    data.fullName = normalizeRequiredString(payload.fullName);
  }

  if (payload.callsign !== undefined) {
    data.callsign = normalizeRequiredString(payload.callsign);
  }

  if (currentProfile) {
    const nextFullName = payload.fullName !== undefined ? normalizeRequiredString(payload.fullName) : currentProfile.fullName;
    const nextCallsign = payload.callsign !== undefined ? normalizeRequiredString(payload.callsign) : currentProfile.callsign;

    if (!nextFullName && !nextCallsign) {
      return createErrorResponse("Укажите ФИО или позывной.");
    }
  }

  if (payload.birthDate !== undefined) {
    data.birthDate = parseNullableDate(payload.birthDate);
  }

  if (payload.affiliation !== undefined) {
    data.affiliation = isStalkerAffiliation(payload.affiliation) ? payload.affiliation : null;
  }

  if (payload.photoUrl !== undefined) {
    data.photoUrl = normalizeNullableString(payload.photoUrl);
  }

  if (payload.appearance !== undefined) {
    data.appearance = normalizeNullableString(payload.appearance);
  }

  if (payload.notes !== undefined) {
    data.notes = normalizeNullableString(payload.notes);
  }

  if (payload.status !== undefined) {
    data.status = payload.status;
  }

  if (payload.createdBy !== undefined) {
    data.createdBy = normalizeNullableString(payload.createdBy);
  }

  if (payload.updatedBy !== undefined) {
    data.updatedBy = normalizeNullableString(payload.updatedBy);
  }

  try {
    const prisma = getPrismaClient();
    const stalker = await prisma.stalker.update({
      data,
      where: { id },
    });

    return Response.json(mapStalkerToProfile(stalker));
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Профиль сталкера не найден.", 404);
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
    await prisma.stalker.delete({
      where: { id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Профиль сталкера не найден.", 404);
    }

    throw error;
  }
}
