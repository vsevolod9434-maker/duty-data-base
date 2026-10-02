import type { TradeItem, TradeOperation } from "./types";

export type TradeDraftItem = {
  key: string;
  id?: string;
  name: string;
  quantity: string;
  price: string;
  notes: string;
};

let tradeDraftItemCounter = 0;

function createTradeDraftItemKey() {
  tradeDraftItemCounter += 1;
  return `trade-draft-item-${Date.now()}-${tradeDraftItemCounter}`;
}

export function createEmptyTradeDraftItem(): TradeDraftItem {
  return { key: createTradeDraftItemKey(), name: "", quantity: "1", price: "", notes: "" };
}

export function getTradeDraftItemsFromOperation(operation: TradeOperation): TradeDraftItem[] {
  if (operation.items.length === 0) {
    return [createEmptyTradeDraftItem()];
  }

  return operation.items.map((item) => ({
    key: item.id || createTradeDraftItemKey(),
    id: item.id,
    name: item.name,
    quantity: String(item.quantity),
    price: String(item.price),
    notes: item.notes ?? "",
  }));
}

function parseDraftNumber(value: string) {
  return Number(value.replace(",", ".").trim());
}

export function getTradeDraftItemTotal(item: TradeDraftItem) {
  const quantity = parseDraftNumber(item.quantity);
  const price = parseDraftNumber(item.price);

  return Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0;
}

export function getTradeDraftTotal(items: TradeDraftItem[]) {
  return items.reduce((sum, item) => sum + getTradeDraftItemTotal(item), 0);
}

export type TradeDraftValidation =
  | { ok: true; items: TradeItem[]; totalAmount: number }
  | { ok: false; message: string; itemKey: string; field: "name" | "quantity" | "price" };

export function validateTradeDraftItems(items: TradeDraftItem[]): TradeDraftValidation {
  const filledItems = items.filter((item) => item.name.trim() || item.price.trim());

  if (filledItems.length === 0) {
    return { ok: false, message: "Укажите предмет операции.", itemKey: items[0]?.key ?? "", field: "name" };
  }

  const parsedItems: TradeItem[] = [];

  for (const [index, item] of filledItems.entries()) {
    const quantity = parseDraftNumber(item.quantity);
    const price = parseDraftNumber(item.price);
    const position = filledItems.length > 1 ? ` (позиция ${index + 1})` : "";

    if (!item.name.trim()) {
      return { ok: false, message: `Укажите название предмета${position}.`, itemKey: item.key, field: "name" };
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, message: `Укажите корректное количество${position}.`, itemKey: item.key, field: "quantity" };
    }

    if (!item.price.trim() || !Number.isFinite(price) || price < 0) {
      return { ok: false, message: `Укажите корректную цену за единицу${position}.`, itemKey: item.key, field: "price" };
    }

    parsedItems.push({
      id: item.id ?? `trade-item-${Date.now()}-${index}`,
      name: item.name.trim(),
      quantity,
      price,
      notes: item.notes.trim(),
    });
  }

  return {
    ok: true,
    items: parsedItems,
    totalAmount: parsedItems.reduce((sum, item) => sum + item.quantity * item.price, 0),
  };
}

export function getTradeItemsSummary(items: Pick<TradeItem, "name">[]) {
  const firstName = items[0]?.name || "Предмет не указан";
  return items.length > 1 ? `${firstName} и ещё ${items.length - 1}` : firstName;
}
