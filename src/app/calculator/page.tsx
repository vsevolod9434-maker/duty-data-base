"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { apiFetchJson } from "@/lib/api-client";
import { cachePolicy, dutyDataKeys, TWO_HOURS, useCurrentUserCacheKey } from "@/lib/data-cache";

type CalculatorCatalogItem = {
  id: string;
  kind: "item" | "bundle" | string;
  categoryId: string;
  categoryName: string;
  name: string;
  contents: string | null;
  traderPrice: string | null;
  basePrice: string | null;
  generalPrice: string;
  partnerPrice: string;
  tenantPrice: string;
  note: string | null;
};

type CalculatorCatalogCategory = {
  id: string;
  name: string;
  items: Omit<CalculatorCatalogItem, "categoryId" | "categoryName">[];
};

type CalculatorCatalogResponse = {
  categories: CalculatorCatalogCategory[];
};

type CalculatorCartItem = {
  item: CalculatorCatalogItem;
  quantityInput: string;
};

const ALL_CATEGORIES = "all";

async function fetchCalculatorCatalog() {
  const payload = await apiFetchJson<CalculatorCatalogResponse>(
    "/api/calculator/catalog",
    { cache: "no-store" },
    "Не удалось загрузить каталог.",
  );

  return payload.categories;
}

function parsePrice(value: string | null | undefined) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function normalizeQuantity(value: string) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function getItemSearchText(item: CalculatorCatalogItem) {
  return [item.name, item.categoryName, item.note, item.contents].filter(Boolean).join(" ").toLocaleLowerCase("ru-RU");
}

export default function CalculatorPage() {
  const { currentUserKey, isCurrentUserLoading } = useCurrentUserCacheKey();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [cartItems, setCartItems] = useState<CalculatorCartItem[]>([]);

  const catalogQuery = useQuery({
    queryKey: dutyDataKeys.calculatorCatalog(currentUserKey ?? "pending"),
    queryFn: fetchCalculatorCatalog,
    enabled: Boolean(currentUserKey),
    gcTime: TWO_HOURS,
    staleTime: cachePolicy.calculatorCatalog,
  });

  const categories = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const catalogItems = useMemo(
    () =>
      categories.flatMap((category) =>
        category.items.map((item) => ({
          ...item,
          categoryId: category.id,
          categoryName: category.name,
        })),
      ),
    [categories],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru-RU");

    return catalogItems.filter((item) => {
      const matchesCategory = categoryFilter === ALL_CATEGORIES || item.categoryId === categoryFilter;
      const matchesSearch = !normalizedQuery || getItemSearchText(item).includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });
  }, [catalogItems, categoryFilter, searchQuery]);
  const totals = useMemo(() => {
    return cartItems.reduce(
      (currentTotals, cartItem) => {
        const quantity = normalizeQuantity(cartItem.quantityInput);

        return {
          general: currentTotals.general + parsePrice(cartItem.item.generalPrice) * quantity,
          partner: currentTotals.partner + parsePrice(cartItem.item.partnerPrice) * quantity,
          tenant: currentTotals.tenant + parsePrice(cartItem.item.tenantPrice) * quantity,
        };
      },
      { general: 0, partner: 0, tenant: 0 },
    );
  }, [cartItems]);

  function addToCart(item: CalculatorCatalogItem) {
    setCartItems((currentItems) => {
      const existingItem = currentItems.find((cartItem) => cartItem.item.id === item.id);

      if (existingItem) {
        return currentItems.map((cartItem) =>
          cartItem.item.id === item.id
            ? { ...cartItem, quantityInput: String(normalizeQuantity(cartItem.quantityInput) + 1) }
            : cartItem,
        );
      }

      return [...currentItems, { item, quantityInput: "1" }];
    });
  }

  function removeFromCart(itemId: string) {
    setCartItems((currentItems) => currentItems.filter((cartItem) => cartItem.item.id !== itemId));
  }

  function changeQuantity(itemId: string, value: string) {
    const normalizedValue = value.replace(/[^\d]/g, "");
    setCartItems((currentItems) =>
      currentItems.map((cartItem) =>
        cartItem.item.id === itemId ? { ...cartItem, quantityInput: normalizedValue } : cartItem,
      ),
    );
  }

  function normalizeQuantityInput(itemId: string) {
    setCartItems((currentItems) =>
      currentItems.map((cartItem) =>
        cartItem.item.id === itemId
          ? { ...cartItem, quantityInput: String(normalizeQuantity(cartItem.quantityInput)) }
          : cartItem,
      ),
    );
  }

  function stepQuantity(itemId: string, step: 1 | -1) {
    setCartItems((currentItems) =>
      currentItems.map((cartItem) => {
        if (cartItem.item.id !== itemId) {
          return cartItem;
        }

        return {
          ...cartItem,
          quantityInput: String(Math.max(1, normalizeQuantity(cartItem.quantityInput) + step)),
        };
      }),
    );
  }

  return (
    <main className="pda-page calculator-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Калькулятор" />

        <div className="pda-content calculator-content">
          <section className="section-panel calculator-shell">
            <div className="calculator-layout">
              <section className="calculator-catalog-panel" aria-labelledby="calculator-catalog-title">
                <div className="calculator-panel-header">
                  <div>
                    <h2 id="calculator-catalog-title">Каталог снабжения</h2>
                    <span>{filteredItems.length > 0 ? `Найдено позиций: ${filteredItems.length}` : "Позиции не найдены"}</span>
                  </div>
                </div>

                <div className="calculator-filters">
                  <label className="filter-field">
                    <span>Поиск</span>
                    <input
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Название, категория, состав или примечание"
                      type="search"
                      value={searchQuery}
                    />
                  </label>
                  <label className="filter-field">
                    <span>Категория</span>
                    <select onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
                      <option value={ALL_CATEGORIES}>Все категории</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {catalogQuery.isError ? (
                  <div className="empty-state calculator-empty-state">
                    <p>Не удалось загрузить каталог.</p>
                  </div>
                ) : isCurrentUserLoading || catalogQuery.isPending ? (
                  <div className="empty-state calculator-empty-state">
                    <p>Загрузка каталога...</p>
                  </div>
                ) : filteredItems.length > 0 ? (
                  <div className="calculator-catalog-list">
                    {filteredItems.map((item) => (
                      <article className="calculator-catalog-card" key={item.id}>
                        <div className="calculator-card-head">
                          <div className="calculator-card-main">
                            <div className="calculator-card-title-line">
                              <h3>{item.name}</h3>
                              <span className="calculator-category-label">{item.categoryName}</span>
                              {item.basePrice ? (
                                <span className="calculator-info-tooltip">
                                  <button
                                    aria-label={`Наша цена: ${formatMoney(parsePrice(item.basePrice))} ₽`}
                                    className="calculator-info-button"
                                    type="button"
                                  >
                                    i
                                  </button>
                                  <span className="calculator-tooltip-content" role="tooltip">
                                    Наша цена: {formatMoney(parsePrice(item.basePrice))} ₽
                                  </span>
                                </span>
                              ) : null}
                            </div>

                            <div className="calculator-price-grid">
                              <div>
                                <span>Общая</span>
                                <strong>{formatMoney(parsePrice(item.generalPrice))} ₽</strong>
                              </div>
                              <div>
                                <span>Сотрудничающие</span>
                                <strong>{formatMoney(parsePrice(item.partnerPrice))} ₽</strong>
                              </div>
                              <div>
                                <span>Жильцы</span>
                                <strong>{formatMoney(parsePrice(item.tenantPrice))} ₽</strong>
                              </div>
                            </div>
                          </div>

                          <button className="primary-command calculator-add-button" onClick={() => addToCart(item)} type="button">
                            Добавить
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state calculator-empty-state">
                    <p>Позиции не найдены.</p>
                  </div>
                )}
              </section>

              <aside className="calculator-cart-panel" aria-labelledby="calculator-cart-title">
                <div className="calculator-panel-header">
                  <div>
                    <h2 id="calculator-cart-title">Корзина расчёта</h2>
                    <span>{cartItems.length > 0 ? `Выбрано позиций: ${cartItems.length}` : "Позиции не выбраны."}</span>
                  </div>
                  {cartItems.length > 0 ? (
                    <button className="command-row calculator-clear-button" onClick={() => setCartItems([])} type="button">
                      Очистить расчёт
                    </button>
                  ) : null}
                </div>

                <div className="calculator-cart-list">
                  {cartItems.length > 0 ? (
                    cartItems.map((cartItem) => {
                      const quantity = normalizeQuantity(cartItem.quantityInput);

                      return (
                        <article className="calculator-cart-card" key={cartItem.item.id}>
                          <div className="calculator-cart-card-head">
                            <strong>{cartItem.item.name}</strong>
                            <button className="command-row calculator-remove-button" onClick={() => removeFromCart(cartItem.item.id)} type="button">
                              Удалить
                            </button>
                          </div>

                          <div className="calculator-quantity-control">
                            <button className="calculator-quantity-button" onClick={() => stepQuantity(cartItem.item.id, -1)} type="button">
                              −
                            </button>
                            <input
                              aria-label={`Количество: ${cartItem.item.name}`}
                              inputMode="numeric"
                              min={1}
                              onBlur={() => normalizeQuantityInput(cartItem.item.id)}
                              onChange={(event) => changeQuantity(cartItem.item.id, event.target.value)}
                              type="text"
                              value={cartItem.quantityInput}
                            />
                            <button className="calculator-quantity-button" onClick={() => stepQuantity(cartItem.item.id, 1)} type="button">
                              +
                            </button>
                          </div>

                          <div className="calculator-cart-sums">
                            <div>
                              <span>Общая</span>
                              <p>{formatMoney(parsePrice(cartItem.item.generalPrice) * quantity)} ₽</p>
                            </div>
                            <div>
                              <span>Для сотрудничающих</span>
                              <p>{formatMoney(parsePrice(cartItem.item.partnerPrice) * quantity)} ₽</p>
                            </div>
                            <div>
                              <span>Для жильцов</span>
                              <p>{formatMoney(parsePrice(cartItem.item.tenantPrice) * quantity)} ₽</p>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="empty-state calculator-empty-state">
                      <p>Позиции не выбраны.</p>
                    </div>
                  )}
                </div>

                <section className="calculator-total-block" aria-labelledby="calculator-total-title">
                  <h2 id="calculator-total-title">Итог расчёта</h2>
                  <div>
                    <span>Общая цена (≥25%)</span>
                    <p>{formatMoney(totals.general)} ₽</p>
                  </div>
                  <div>
                    <span>Цена для сотрудничающих сталкеров (≥20%)</span>
                    <p>{formatMoney(totals.partner)} ₽</p>
                  </div>
                  <div>
                    <span>Цена для наших жильцов (≥18%)</span>
                    <p>{formatMoney(totals.tenant)} ₽</p>
                  </div>
                </section>
              </aside>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
