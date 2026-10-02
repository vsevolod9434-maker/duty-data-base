import { Prisma } from "@/generated/prisma/client";
import type { CatalogItemInput } from "@/lib/calculator-catalog";
import { getPrismaClient } from "@/lib/prisma";

export function createCatalogErrorResponse(message: string, status = 400) {
  return Response.json({ error: message, message }, { status });
}

function formatPrice(value: { toString: () => string } | null) {
  return value ? value.toString() : null;
}

type CatalogItemRecord = {
  id: string;
  kind: string;
  name: string;
  contents: string | null;
  traderPrice: { toString: () => string } | null;
  basePrice: { toString: () => string } | null;
  generalPrice: { toString: () => string };
  partnerPrice: { toString: () => string };
  tenantPrice: { toString: () => string };
  note: string | null;
  categoryId: string;
};

export function mapCatalogItemToResponse(item: CatalogItemRecord) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    kind: item.kind,
    name: item.name,
    contents: item.contents,
    traderPrice: formatPrice(item.traderPrice),
    basePrice: formatPrice(item.basePrice),
    generalPrice: formatPrice(item.generalPrice),
    partnerPrice: formatPrice(item.partnerPrice),
    tenantPrice: formatPrice(item.tenantPrice),
    note: item.note,
  };
}

export async function resolveCatalogCategoryId(input: CatalogItemInput) {
  const prisma = getPrismaClient();

  if (input.newCategoryName) {
    const existing = await prisma.supplyCatalogCategory.findUnique({ where: { name: input.newCategoryName } });

    if (existing) {
      return existing.id;
    }

    const lastCategory = await prisma.supplyCatalogCategory.findFirst({ orderBy: { sortOrder: "desc" } });
    const category = await prisma.supplyCatalogCategory.create({
      data: { name: input.newCategoryName, sortOrder: (lastCategory?.sortOrder ?? 0) + 1 },
    });
    return category.id;
  }

  const category = input.categoryId ? await prisma.supplyCatalogCategory.findUnique({ where: { id: input.categoryId } }) : null;
  return category?.id ?? null;
}

export function getCatalogItemData(input: CatalogItemInput) {
  return {
    kind: input.kind,
    name: input.name,
    contents: input.contents,
    basePrice: input.basePrice === null ? null : new Prisma.Decimal(input.basePrice),
    generalPrice: new Prisma.Decimal(input.generalPrice),
    partnerPrice: new Prisma.Decimal(input.partnerPrice),
    tenantPrice: new Prisma.Decimal(input.tenantPrice),
    note: input.note,
  };
}

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const duplicateCatalogItemMessage = "Такой товар уже есть в этой категории.";
