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

type ParsedTooltip = {
  category: string;
  name: string;
  tooltip: string;
};

const catalogPath = path.join(process.cwd(), "tools", "calculator-source", "supply-catalog.tsv");
const tooltipsPath = path.join(process.cwd(), "tools", "calculator-source", "supply-catalog-tooltips.tsv");

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

function parseTsvRecords(rawContent: string) {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentCell = "";
  let isQuoted = false;

  for (let index = 0; index < rawContent.length; index += 1) {
    const character = rawContent[index];
    const nextCharacter = rawContent[index + 1];

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
      currentRecord.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !isQuoted) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRecord.push(currentCell);

      if (currentRecord.some((cell) => cell.trim())) {
        records.push(currentRecord);
      }

      currentRecord = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  currentRecord.push(currentCell);

  if (currentRecord.some((cell) => cell.trim())) {
    records.push(currentRecord);
  }

  return records;
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
  const records = parseTsvRecords(rawContent);
  const headerLine = records.shift();

  if (!headerLine) {
    return { items: [] as ParsedItem[], skipped: 0 };
  }

  const headers = headerLine.map((header) => header.replace(/^\uFEFF/, "").trim());
  const items: ParsedItem[] = [];
  let skipped = 0;

  records.forEach((cells, recordIndex) => {
    const row = headers.reduce<CatalogRow>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
    const parsedItem = parseCatalogRow(row, recordIndex + 2);

    if (!parsedItem) {
      skipped += 1;
      return;
    }

    items.push(parsedItem);
  });

  return { items, skipped };
}

async function readTooltips() {
  let rawContent: string;

  try {
    rawContent = await readFile(tooltipsPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { missing: true, skipped: 0, tooltips: [] as ParsedTooltip[] };
    }

    throw error;
  }

  const records = parseTsvRecords(rawContent);
  const headerLine = records.shift();

  if (!headerLine) {
    return { missing: false, skipped: 0, tooltips: [] as ParsedTooltip[] };
  }

  const headers = headerLine.map((header) => header.replace(/^\uFEFF/, "").trim());
  const tooltips: ParsedTooltip[] = [];
  let skipped = 0;

  records.forEach((cells) => {
    const row = headers.reduce<CatalogRow>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
    const category = row.category?.trim();
    const name = row.name?.trim();
    const tooltip = row.tooltip?.trim();

    if (!category || !name || !tooltip) {
      skipped += 1;
      return;
    }

    tooltips.push({ category, name, tooltip });
  });

  return { missing: false, skipped, tooltips };
}

async function main() {
  const prisma = createPrismaClient();
  const { items, skipped } = await readCatalog();
  let categoriesCreated = 0;
  let categoriesUpdated = 0;
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let tooltipsUpdated = 0;
  let tooltipsSkipped = 0;
  let tooltipsMissingItems = 0;

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

    const tooltipImport = await readTooltips();
    tooltipsSkipped = tooltipImport.skipped;

    if (tooltipImport.missing) {
      console.warn("Файл подсказок каталога не найден, импорт подсказок пропущен.");
    }

    for (const tooltip of tooltipImport.tooltips) {
      const categoryId = categoryIds.get(tooltip.category);
      let existingItem: { id: string } | null = null;

      if (categoryId) {
        existingItem = await prisma.supplyCatalogItem.findFirst({
          select: { id: true },
          where: {
            categoryId,
            name: tooltip.name,
          },
        });
      }

      if (!existingItem) {
        const itemsByName = await prisma.supplyCatalogItem.findMany({
          select: { id: true, kind: true },
          where: { name: tooltip.name },
        });
        const bundleMatches = itemsByName.filter((item) => item.kind === "bundle");

        if (itemsByName.length === 1) {
          existingItem = itemsByName[0];
        } else if (bundleMatches.length === 1) {
          existingItem = bundleMatches[0];
        } else if (itemsByName.length > 1) {
          tooltipsMissingItems += 1;
          console.warn(`Подсказка пропущена: найдено несколько позиций — ${tooltip.category} / ${tooltip.name}`);
          continue;
        }
      }

      if (!existingItem) {
        tooltipsMissingItems += 1;
        console.warn(`Подсказка пропущена: позиция не найдена — ${tooltip.category} / ${tooltip.name}`);
        continue;
      }

      await prisma.supplyCatalogItem.update({
        data: { contents: tooltip.tooltip },
        where: { id: existingItem.id },
      });
      tooltipsUpdated += 1;
    }
    console.log(`Категорий создано: ${categoriesCreated}`);
    console.log(`Категорий обновлено: ${categoriesUpdated}`);
    console.log(`Позиций создано: ${itemsCreated}`);
    console.log(`Позиций обновлено: ${itemsUpdated}`);
    console.log(`Строк пропущено: ${skipped}`);
    console.log(`Подсказок обновлено: ${tooltipsUpdated}`);
    console.log(`Подсказок пропущено: ${tooltipsSkipped}`);
    console.log(`Подсказок без позиции: ${tooltipsMissingItems}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Не удалось заполнить каталог.");
  process.exit(1);
});
