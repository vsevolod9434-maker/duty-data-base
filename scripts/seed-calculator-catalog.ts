import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

type CatalogRow = Record<string, string | undefined>;

type ParsedItem = {
  kind: string;
  category: string;
  categorySortOrder: number;
  name: string;
  contents: string | null;
  traderPrice: Prisma.Decimal | null;
  basePrice: Prisma.Decimal | null;
  generalPrice: Prisma.Decimal;
  partnerPrice: Prisma.Decimal;
  tenantPrice: Prisma.Decimal;
  note: string | null;
  sortOrder: number;
};

const catalogPath = path.join(process.cwd(), "tools", "calculator-source", "supply-catalog.tsv");

function normalizeConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return url.toString();
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

  if (!connectionString) {
    throw new Error("Строка подключения не задана.");
  }

  const poolConfig: PoolConfig = {
    connectionString: normalizeConnectionString(connectionString),
    ssl: {
      rejectUnauthorized: false,
    },
  };

  return new PrismaClient({
    adapter: new PrismaPg(poolConfig),
  });
}

function parseTsvLine(line: string) {
  const cells: string[] = [];
  let currentCell = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && isQuoted && nextCharacter === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      isQuoted = !isQuoted;
      continue;
    }

    if (character === "\t" && !isQuoted) {
      cells.push(currentCell);
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell);
  return cells;
}

function parseNumber(value: string | undefined, fallback = 0) {
  const normalizedValue = value?.replace(/\s/g, "").replace(",", ".").trim();

  if (!normalizedValue) {
    return fallback;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function parsePrice(value: string | undefined) {
  const normalizedValue = value?.replace(/\s/g, "").replace(",", ".").trim();

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return new Prisma.Decimal(normalizedValue);
}

function normalizeOptionalString(value: string | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue || null;
}

function parseCatalogRow(row: CatalogRow, lineNumber: number): ParsedItem | null {
  const kind = row.kind?.trim();
  const category = row.category?.trim();
  const name = row.name?.trim();

  if (kind !== "item" && kind !== "bundle") {
    return null;
  }

  if (!category || !name) {
    return null;
  }

  const generalPrice = parsePrice(row.generalPrice);
  const partnerPrice = parsePrice(row.partnerPrice);
  const tenantPrice = parsePrice(row.tenantPrice);

  if (!generalPrice || !partnerPrice || !tenantPrice) {
    return null;
  }

  return {
    kind,
    category,
    categorySortOrder: parseNumber(row.categorySortOrder, lineNumber),
    name,
    contents: normalizeOptionalString(row.contents),
    traderPrice: parsePrice(row.traderPrice),
    basePrice: parsePrice(row.basePrice),
    generalPrice,
    partnerPrice,
    tenantPrice,
    note: normalizeOptionalString(row.note),
    sortOrder: parseNumber(row.sortOrder, lineNumber),
  };
}

async function readCatalog() {
  const rawContent = await readFile(catalogPath, "utf8");
  const lines = rawContent.split(/\r?\n/);
  const headerLine = lines.shift();

  if (!headerLine) {
    return { items: [] as ParsedItem[], skipped: 0 };
  }

  const headers = parseTsvLine(headerLine).map((header) => header.trim());
  const items: ParsedItem[] = [];
  let skipped = 0;

  lines.forEach((line, lineIndex) => {
    if (!line.trim()) {
      return;
    }

    const cells = parseTsvLine(line);
    const row = headers.reduce<CatalogRow>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
    const parsedItem = parseCatalogRow(row, lineIndex + 2);

    if (!parsedItem) {
      skipped += 1;
      return;
    }

    items.push(parsedItem);
  });

  return { items, skipped };
}

async function main() {
  const prisma = createPrismaClient();
  const { items, skipped } = await readCatalog();
  let categoriesCreated = 0;
  let categoriesUpdated = 0;
  let itemsCreated = 0;
  let itemsUpdated = 0;

  try {
    const categories = new Map<string, number>();

    items.forEach((item) => {
      const currentSortOrder = categories.get(item.category);
      categories.set(
        item.category,
        currentSortOrder === undefined ? item.categorySortOrder : Math.min(currentSortOrder, item.categorySortOrder),
      );
    });

    const categoryIds = new Map<string, string>();

    for (const [categoryName, sortOrder] of categories) {
      const existingCategory = await prisma.supplyCatalogCategory.findUnique({
        select: { id: true },
        where: { name: categoryName },
      });

      if (existingCategory) {
        const category = await prisma.supplyCatalogCategory.update({
          data: { sortOrder },
          select: { id: true },
          where: { id: existingCategory.id },
        });
        categoryIds.set(categoryName, category.id);
        categoriesUpdated += 1;
      } else {
        const category = await prisma.supplyCatalogCategory.create({
          data: {
            name: categoryName,
            sortOrder,
          },
          select: { id: true },
        });
        categoryIds.set(categoryName, category.id);
        categoriesCreated += 1;
      }
    }

    for (const item of items) {
      const categoryId = categoryIds.get(item.category);

      if (!categoryId) {
        continue;
      }

      const existingItem = await prisma.supplyCatalogItem.findUnique({
        select: { id: true },
        where: {
          categoryId_name_kind: {
            categoryId,
            kind: item.kind,
            name: item.name,
          },
        },
      });
      const data = {
        contents: item.contents,
        traderPrice: item.traderPrice,
        basePrice: item.basePrice,
        generalPrice: item.generalPrice,
        partnerPrice: item.partnerPrice,
        tenantPrice: item.tenantPrice,
        note: item.note,
        isActive: true,
        sortOrder: item.sortOrder,
      };

      if (existingItem) {
        await prisma.supplyCatalogItem.update({
          data,
          where: { id: existingItem.id },
        });
        itemsUpdated += 1;
      } else {
        await prisma.supplyCatalogItem.create({
          data: {
            ...data,
            categoryId,
            kind: item.kind,
            name: item.name,
          },
        });
        itemsCreated += 1;
      }
    }

    console.log(`Категорий создано: ${categoriesCreated}`);
    console.log(`Категорий обновлено: ${categoriesUpdated}`);
    console.log(`Позиций создано: ${itemsCreated}`);
    console.log(`Позиций обновлено: ${itemsUpdated}`);
    console.log(`Строк пропущено: ${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Не удалось заполнить каталог.");
  process.exit(1);
});
