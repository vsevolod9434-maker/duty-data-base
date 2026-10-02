export type CatalogItemKind = "item" | "bundle";

export type CatalogItemInput = {
  categoryId: string | null;
  newCategoryName: string | null;
  kind: CatalogItemKind;
  name: string;
  contents: string | null;
  basePrice: number | null;
  generalPrice: number;
  partnerPrice: number;
  tenantPrice: number;
  note: string | null;
};

export type CatalogItemValidation = { ok: true; value: CatalogItemInput } | { ok: false; message: string };

export function canManageCalculatorCatalog(role: string | null | undefined) {
  return role === "system_admin" || role === "officer";
}

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

function parsePrice(value: unknown) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return null;
  }

  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function validateCatalogItemInput(payload: unknown): CatalogItemValidation {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const name = optionalText(record.name);
  const categoryId = optionalText(record.categoryId);
  const newCategoryName = optionalText(record.newCategoryName);
  const kind: CatalogItemKind = record.kind === "bundle" ? "bundle" : "item";

  if (!name) {
    return { ok: false, message: "Укажите название товара." };
  }

  if (name.length > 200) {
    return { ok: false, message: "Название товара не должно превышать 200 символов." };
  }

  if (!categoryId && !newCategoryName) {
    return { ok: false, message: "Выберите категорию или укажите новую." };
  }

  const prices = {
    generalPrice: parsePrice(record.generalPrice),
    partnerPrice: parsePrice(record.partnerPrice),
    tenantPrice: parsePrice(record.tenantPrice),
  };
  const priceLabels: Record<keyof typeof prices, string> = {
    generalPrice: "общую цену",
    partnerPrice: "цену для сотрудничающих",
    tenantPrice: "цену для жильцов",
  };

  for (const key of Object.keys(prices) as Array<keyof typeof prices>) {
    const price = prices[key];

    if (price === null || Number.isNaN(price) || price < 0) {
      return { ok: false, message: `Укажите корректную ${priceLabels[key]}.` };
    }
  }

  const basePrice = parsePrice(record.basePrice);

  if (basePrice !== null && (Number.isNaN(basePrice) || basePrice < 0)) {
    return { ok: false, message: "Укажите корректную нашу цену или оставьте поле пустым." };
  }

  return {
    ok: true,
    value: {
      categoryId: newCategoryName ? null : categoryId,
      newCategoryName,
      kind,
      name,
      contents: kind === "bundle" ? optionalText(record.contents) : null,
      basePrice,
      generalPrice: prices.generalPrice as number,
      partnerPrice: prices.partnerPrice as number,
      tenantPrice: prices.tenantPrice as number,
      note: optionalText(record.note),
    },
  };
}
