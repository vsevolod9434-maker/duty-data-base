import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";
import { createDefaultApartments } from "@/lib/apartment-utils";
import { mapApartmentToResponse } from "../apartment-route-utils";

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

export async function POST() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();
  const existingCount = await prisma.apartment.count();

  if (existingCount === 0) {
    await prisma.apartment.createMany({
      data: createDefaultApartments().map((apartment) => ({
        id: apartment.id,
        name: apartment.name,
        status: apartment.status,
        notes: apartment.notes,
        createdAt: new Date(apartment.createdAt),
        updatedAt: new Date(apartment.updatedAt),
      })),
    });
  }

  const apartments = await prisma.apartment.findMany({
    include: apartmentInclude,
    orderBy: { name: "asc" },
  });

  return Response.json(apartments.map(mapApartmentToResponse));
}
