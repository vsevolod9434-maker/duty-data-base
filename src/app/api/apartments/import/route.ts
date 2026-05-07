import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createSystemDate } from "@/lib/stalker-utils";
import {
  apartmentResponseInclude,
  createErrorResponse,
  getOccupancyStatus,
  mapApartmentToResponse,
  normalizeNullableString,
  normalizePaymentPayloads,
  normalizeString,
  normalizeTenantPayloads,
  parseStoredDate,
  type ApartmentPayload,
} from "../apartment-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as unknown;

  if (!Array.isArray(payload)) {
    return createErrorResponse("Для импорта передан не список квартир.");
  }

  const prisma = getPrismaClient();
  const stalkers = await prisma.stalker.findMany({ select: { id: true } });
  const existingStalkerIds = new Set(stalkers.map((stalker) => stalker.id));
  const now = createSystemDate();
  let skippedTenants = 0;

  const candidates = payload
    .filter((item): item is ApartmentPayload & { id: string } => {
      return Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string";
    })
    .map((apartment) => {
      const createdAt = parseStoredDate(apartment.createdAt, now);
      const updatedAt = parseStoredDate(apartment.updatedAt, createdAt);
      const rawTenantCount = Array.isArray(apartment.tenants) ? apartment.tenants.length : 0;
      const tenants = normalizeTenantPayloads(apartment.tenants, existingStalkerIds, updatedAt);
      skippedTenants += rawTenantCount - tenants.length;

      return {
        id: apartment.id,
        name: normalizeString(apartment.name),
        status: getOccupancyStatus(tenants.length),
        notes: normalizeNullableString(apartment.notes),
        tenants,
        payments: normalizePaymentPayloads(apartment.payments, updatedAt),
        createdAt,
        updatedAt,
      };
    })
    .filter((apartment) => apartment.name);

  if (candidates.length === 0) {
    return createErrorResponse("В переданном списке нет квартир, пригодных для импорта.");
  }

  await prisma.$transaction(
    candidates.flatMap((apartment) => [
      prisma.apartment.upsert({
        create: {
          id: apartment.id,
          name: apartment.name,
          status: apartment.status,
          notes: apartment.notes,
          createdAt: apartment.createdAt,
          updatedAt: apartment.updatedAt,
        },
        update: {
          name: apartment.name,
          status: apartment.status,
          notes: apartment.notes,
          updatedAt: apartment.updatedAt,
        },
        where: { id: apartment.id },
      }),
      prisma.apartmentTenant.deleteMany({
        where: { apartmentId: apartment.id },
      }),
      prisma.apartmentPayment.deleteMany({
        where: { apartmentId: apartment.id },
      }),
      ...apartment.tenants.map((tenant) =>
        prisma.apartmentTenant.create({
          data: {
            ...tenant,
            apartmentId: apartment.id,
          },
        }),
      ),
      ...apartment.payments.map((payment) =>
        prisma.apartmentPayment.create({
          data: {
            ...payment,
            apartmentId: apartment.id,
          },
        }),
      ),
    ]),
  );

  const apartments = await prisma.apartment.findMany({
    include: apartmentResponseInclude,
    orderBy: { name: "asc" },
  });

  return Response.json({
    apartments: apartments.map(mapApartmentToResponse),
    skippedTenants,
  });
}
