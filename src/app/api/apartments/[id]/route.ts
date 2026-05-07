import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  apartmentResponseInclude,
  createErrorResponse,
  getOccupancyStatus,
  isApartmentStatus,
  mapApartmentToResponse,
  normalizeNullableString,
  normalizePaymentPayloads,
  normalizeString,
  normalizeTenantPayloads,
  type ApartmentPayload,
} from "../apartment-route-utils";

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
  const payload = (await request.json().catch(() => null)) as ApartmentPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные квартиры.");
  }

  if (payload.status !== undefined && !isApartmentStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус квартиры.");
  }

  const now = createSystemDate();
  const data: {
    name?: string;
    status?: "free" | "occupied";
    notes?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: now,
  };

  if (payload.name !== undefined) {
    const name = normalizeString(payload.name);

    if (!name) {
      return createErrorResponse("Укажите название квартиры.");
    }

    data.name = name;
  }

  if (payload.notes !== undefined) {
    data.notes = normalizeNullableString(payload.notes);
  }

  try {
    const prisma = getPrismaClient();
    const apartment = await prisma.$transaction(async (tx) => {
      if (payload.tenants !== undefined) {
        const stalkers = await tx.stalker.findMany({ select: { id: true } });
        const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
        const tenants = normalizeTenantPayloads(payload.tenants, existingStalkerIds, now);

        await tx.apartmentTenant.deleteMany({
          where: { apartmentId: id },
        });

        if (tenants.length > 0) {
          await tx.apartmentTenant.createMany({
            data: tenants.map((tenant) => ({
              ...tenant,
              apartmentId: id,
            })),
          });
        }

        data.status = getOccupancyStatus(tenants.length);
      } else if (isApartmentStatus(payload.status)) {
        data.status = payload.status;
      }

      if (payload.payments !== undefined) {
        const payments = normalizePaymentPayloads(payload.payments, now);

        await tx.apartmentPayment.deleteMany({
          where: { apartmentId: id },
        });

        if (payments.length > 0) {
          await tx.apartmentPayment.createMany({
            data: payments.map((payment) => ({
              ...payment,
              apartmentId: id,
            })),
          });
        }
      }

      await tx.apartment.update({
        data,
        where: { id },
      });

      return tx.apartment.findUniqueOrThrow({
        include: apartmentResponseInclude,
        where: { id },
      });
    });

    return Response.json(mapApartmentToResponse(apartment));
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Квартира не найдена.", 404);
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
    await prisma.apartment.delete({
      where: { id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    if (isNotFoundError(error)) {
      return createErrorResponse("Квартира не найдена.", 404);
    }

    throw error;
  }
}
