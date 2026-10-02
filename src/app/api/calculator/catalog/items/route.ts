import { requireApiAuth } from "@/lib/auth/require-api-auth";
import { canManageCalculatorCatalog, validateCatalogItemInput } from "@/lib/calculator-catalog";
import { getPrismaClient } from "@/lib/prisma";
import {
  createCatalogErrorResponse,
  duplicateCatalogItemMessage,
  getCatalogItemData,
  isUniqueViolation,
  mapCatalogItemToResponse,
  resolveCatalogCategoryId,
} from "../catalog-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (!canManageCalculatorCatalog(auth.role)) {
    return createCatalogErrorResponse("Изменять каталог могут только офицеры.", 403);
  }

  const validation = validateCatalogItemInput(await request.json().catch(() => null));

  if (!validation.ok) {
    return createCatalogErrorResponse(validation.message);
  }

  try {
    const categoryId = await resolveCatalogCategoryId(validation.value);

    if (!categoryId) {
      return createCatalogErrorResponse("Категория не найдена.", 404);
    }

    const prisma = getPrismaClient();
    const lastItem = await prisma.supplyCatalogItem.findFirst({ orderBy: { sortOrder: "desc" }, where: { categoryId } });
    const item = await prisma.supplyCatalogItem.create({
      data: { ...getCatalogItemData(validation.value), categoryId, sortOrder: (lastItem?.sortOrder ?? 0) + 1 },
    });

    return Response.json(mapCatalogItemToResponse(item), { status: 201 });
  } catch (error) {
    return isUniqueViolation(error)
      ? createCatalogErrorResponse(duplicateCatalogItemMessage, 409)
      : createCatalogErrorResponse("Не удалось добавить товар.", 500);
  }
}
