import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { getPrismaClient } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createCatalogErrorResponse() {
  return Response.json(
    {
      error: "Не удалось загрузить каталог.",
      message: "Не удалось загрузить каталог.",
    },
    { status: 500 },
  );
}

function formatPrice(value: { toString: () => string } | null) {
  return value ? value.toString() : null;
}

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const prisma = getPrismaClient();
    const categories = await prisma.supplyCatalogCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        items: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            kind: true,
            name: true,
            contents: true,
            traderPrice: true,
            basePrice: true,
            generalPrice: true,
            partnerPrice: true,
            tenantPrice: true,
            note: true,
          },
          where: {
            isActive: true,
          },
        },
      },
    });

    return Response.json({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        items: category.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          contents: item.contents,
          traderPrice: formatPrice(item.traderPrice),
          basePrice: formatPrice(item.basePrice),
          generalPrice: formatPrice(item.generalPrice),
          partnerPrice: formatPrice(item.partnerPrice),
          tenantPrice: formatPrice(item.tenantPrice),
          note: item.note,
        })),
      })),
    });
  } catch {
    return createCatalogErrorResponse();
  }
}
