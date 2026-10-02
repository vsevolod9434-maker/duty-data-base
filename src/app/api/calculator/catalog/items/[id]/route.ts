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
} from "../../catalog-route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CatalogItemContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: CatalogItemContext) {
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

  const { id } = await context.params;

  try {
    const categoryId = await resolveCatalogCategoryId(validation.value);

    if (!categoryId) {
      return createCatalogErrorResponse("Категория не найдена.", 404);
    }

    const item = await getPrismaClient().supplyCatalogItem.update({
      data: { ...getCatalogItemData(validation.value), categoryId },
      where: { id },
    });

    return Response.json(mapCatalogItemToResponse(item));
  } catch (error) {
    return isUniqueViolation(error)
      ? createCatalogErrorResponse(duplicateCatalogItemMessage, 409)
      : createCatalogErrorResponse("Не удалось сохранить товар.", 500);
  }
}

export async function DELETE(_request: Request, context: CatalogItemContext) {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  if (!canManageCalculatorCatalog(auth.role)) {
    return createCatalogErrorResponse("Изменять каталог могут только офицеры.", 403);
  }

  const { id } = await context.params;

  try {
    await getPrismaClient().supplyCatalogItem.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch {
    return createCatalogErrorResponse("Не удалось удалить товар.", 500);
  }
}
