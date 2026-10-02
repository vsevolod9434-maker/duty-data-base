"use client";

import {
  createEmptyTradeDraftItem,
  getTradeDraftItemTotal,
  getTradeDraftTotal,
  type TradeDraftItem,
} from "@/lib/trade-draft";

type TradeItemsEditorProps = {
  items: TradeDraftItem[];
  onChange: (items: TradeDraftItem[]) => void;
  formatMoney: (value: number) => string;
  invalidItemKey?: string;
  invalidField?: "name" | "quantity" | "price";
};

export function TradeItemsEditor({ items, onChange, formatMoney, invalidItemKey, invalidField }: TradeItemsEditorProps) {
  function updateItem(key: string, field: "name" | "quantity" | "price", value: string) {
    onChange(items.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
  }

  function removeItem(key: string) {
    const nextItems = items.filter((item) => item.key !== key);
    onChange(nextItems.length > 0 ? nextItems : [createEmptyTradeDraftItem()]);
  }

  return (
    <div className="trade-items-editor">
      <div className="trade-items-head" aria-hidden="true">
        <span>Предмет</span>
        <span>Кол-во</span>
        <span>Цена за ед.</span>
        <span>Сумма</span>
        <span />
      </div>
      {items.map((item, index) => {
        const isInvalid = (field: "name" | "quantity" | "price") => (item.key === invalidItemKey && invalidField === field) || undefined;

        return (
          <div className="trade-items-row" key={item.key}>
            <input
              aria-invalid={isInvalid("name")}
              aria-label={`Предмет, позиция ${index + 1}`}
              onChange={(event) => updateItem(item.key, "name", event.target.value)}
              placeholder="Название предмета"
              type="text"
              value={item.name}
            />
            <input
              aria-invalid={isInvalid("quantity")}
              aria-label={`Количество, позиция ${index + 1}`}
              inputMode="decimal"
              min="0"
              onChange={(event) => updateItem(item.key, "quantity", event.target.value)}
              type="number"
              value={item.quantity}
            />
            <input
              aria-invalid={isInvalid("price")}
              aria-label={`Цена за единицу, позиция ${index + 1}`}
              inputMode="decimal"
              min="0"
              onChange={(event) => updateItem(item.key, "price", event.target.value)}
              placeholder="0"
              type="number"
              value={item.price}
            />
            <output className="trade-items-sum">{formatMoney(getTradeDraftItemTotal(item))}</output>
            <button
              aria-label={`Убрать позицию ${index + 1}`}
              className="command-row danger-command trade-items-remove"
              disabled={items.length === 1 && !item.name && !item.price}
              onClick={() => removeItem(item.key)}
              title="Убрать позицию"
              type="button"
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="trade-items-footer">
        <button className="command-row trade-items-add" onClick={() => onChange([...items, createEmptyTradeDraftItem()])} type="button">
          + Позиция
        </button>
        <div className="trade-items-total">
          <span>Итого</span>
          <strong>{formatMoney(getTradeDraftTotal(items))}</strong>
        </div>
      </div>
    </div>
  );
}
