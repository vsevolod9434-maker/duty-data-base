import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  createErrorResponse,
  getOccupancyStatus,
  isApartmentStatus,
  mapApartmentToResponse,
  normalizeNullableString,
  normalizePaymentPayloads,
  normalizeString,
  normalizeTenantPayloads,
  type ApartmentPayload,
} from "./apartment-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const apartmentInclude = {
  tenants: {
    orderBy: { addedAt: "asc" },
  },
  payments: {
    orderBy: { paidAt: "desc" },
  },
} as const;

export async function GET() {
  const prisma = getPrismaClient();
  const apartments = await prisma.apartment.findMany({
    include: apartmentInclude,
    orderBy: { name: "asc" },
  });

  return Response.json(apartments.map(mapApartmentToResponse));
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as ApartmentPayload | null;

  if (!payload || typeof payload !== "object") {
    return createErrorResponse("Переданы некорректные данные квартиры.");
  }

  const name = normalizeString(payload.name);

  if (!name) {
    return createErrorResponse("Укажите название квартиры.");
  }

  if (payload.status !== undefined && !isApartmentStatus(payload.status)) {
    return createErrorResponse("Указан некорректный статус квартиры.");
  }

  const prisma = getPrismaClient();
  const stalkers = await prisma.stalker.findMany({ select: { id: true } });
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
  const now = createSystemDate();
  const tenants = normalizeTenantPayloads(payload.tenants, existingStalkerIds, now);
  const payments = normalizePaymentPayloads(payload.payments, now);

  const apartment = await prisma.apartment.create({
    data: {
      id: crypto.randomUUID(),
      name,
      status: getOccupancyStatus(tenants.length),
      notes: normalizeNullableString(payload.notes),
      createdAt: now,
      updatedAt: now,
      tenants: {
        create: tenants,
      },
      payments: {
        create: payments,
      },
    },
    include: apartmentInclude,
  });

  return Response.json(mapApartmentToResponse(apartment), { status: 201 });
}
