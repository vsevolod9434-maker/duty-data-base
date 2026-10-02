"use client";

import { useState, type FormEvent } from "react";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";

export type CatalogItemDraft = {
  categoryId: string;
  newCategoryName: string;
  kind: "item" | "bundle";
  name: string;
  contents: string;
  basePrice: string;
  generalPrice: string;
  partnerPrice: string;
  tenantPrice: string;
  note: string;
};

export const NEW_CATEGORY_VALUE = "__new__";

export function createEmptyCatalogItemDraft(categoryId = ""): CatalogItemDraft {
  return {
    categoryId,
    newCategoryName: "",
    kind: "item",
    name: "",
    contents: "",
    basePrice: "",
    generalPrice: "",
    partnerPrice: "",
    tenantPrice: "",
    note: "",
  };
}

type CatalogItemModalProps = {
  categories: Array<{ id: string; name: string }>;
  initialDraft: CatalogItemDraft;
  isEditing: boolean;
  isSaving: boolean;
  message: string;
  onCancel: (isDirty: boolean) => void;
  onDraftChange?: () => void;
  onSubmit: (draft: CatalogItemDraft) => void;
};

export function CatalogItemModal({
  categories,
  initialDraft,
  isEditing,
  isSaving,
  message,
  onCancel,
  onDraftChange,
  onSubmit,
}: CatalogItemModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const isNewCategory = draft.categoryId === NEW_CATEGORY_VALUE || categories.length === 0;

  function update<Field extends keyof CatalogItemDraft>(field: Field, value: CatalogItemDraft[Field]) {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    onDraftChange?.();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ ...draft, categoryId: isNewCategory ? NEW_CATEGORY_VALUE : draft.categoryId });
  }

  return (
    <div className="pda-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel(isDirty)}>
      <form className="pda-modal catalog-item-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="section-header modal-header">
          <ModalCloseButton />
          <div className="min-w-0">
            <h1>{isEditing ? "Редактирование товара" : "Новый товар"}</h1>
            <p>{isEditing ? "Изменения сразу появятся в каталоге снабжения" : "Товар будет добавлен в каталог снабжения"}</p>
          </div>
        </div>

        <div className="modal-body">
          <section className="form-section">
            <div className="form-section-heading">
              <h2>Товар</h2>
              <span>Обязательно: название, категория и три цены</span>
            </div>
            <div className="task-form-grid">
              <label className="filter-field task-form-wide">
                <span>Название</span>
                <input maxLength={200} onChange={(event) => update("name", event.target.value)} placeholder="Например: Патроны 5.45×39" value={draft.name} />
              </label>
              <label className="filter-field">
                <span>Категория</span>
                <select
                  onChange={(event) => update("categoryId", event.target.value)}
                  value={isNewCategory ? NEW_CATEGORY_VALUE : draft.categoryId}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY_VALUE}>+ Новая категория…</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Тип</span>
                <select onChange={(event) => update("kind", event.target.value as CatalogItemDraft["kind"])} value={draft.kind}>
                  <option value="item">Отдельный товар</option>
                  <option value="bundle">Набор</option>
                </select>
              </label>
              {isNewCategory ? (
                <label className="filter-field task-form-wide">
                  <span>Название новой категории</span>
                  <input maxLength={120} onChange={(event) => update("newCategoryName", event.target.value)} placeholder="Например: Медикаменты" value={draft.newCategoryName} />
                </label>
              ) : null}
              {draft.kind === "bundle" ? (
                <label className="filter-field task-form-wide">
                  <span>Состав набора</span>
                  <textarea onChange={(event) => update("contents", event.target.value)} placeholder="Что входит в набор" rows={2} value={draft.contents} />
                </label>
              ) : null}
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-heading">
              <h2>Цены, ₽</h2>
              <span>Наша цена показывается во всплывающей подсказке</span>
            </div>
            <div className="catalog-price-grid">
              <label className="filter-field">
                <span>Общая</span>
                <input inputMode="decimal" min="0" onChange={(event) => update("generalPrice", event.target.value)} step="any" type="number" value={draft.generalPrice} />
              </label>
              <label className="filter-field">
                <span>Сотрудничающим</span>
                <input inputMode="decimal" min="0" onChange={(event) => update("partnerPrice", event.target.value)} step="any" type="number" value={draft.partnerPrice} />
              </label>
              <label className="filter-field">
                <span>Жильцам</span>
                <input inputMode="decimal" min="0" onChange={(event) => update("tenantPrice", event.target.value)} step="any" type="number" value={draft.tenantPrice} />
              </label>
              <label className="filter-field">
                <span>Наша цена (необяз.)</span>
                <input inputMode="decimal" min="0" onChange={(event) => update("basePrice", event.target.value)} step="any" type="number" value={draft.basePrice} />
              </label>
            </div>
            <label className="filter-field">
              <span>Примечание</span>
              <input maxLength={300} onChange={(event) => update("note", event.target.value)} placeholder="Например: лимит 5 пачек" value={draft.note} />
            </label>
          </section>
        </div>

        <div className="modal-message-slot">{message ? <p className="draft-message">{message}</p> : null}</div>
        <div className="modal-actions">
          <button className="command-row" disabled={isSaving} onClick={() => onCancel(isDirty)} type="button">
            Отмена
          </button>
          <button className="primary-command" disabled={isSaving} type="submit">
            {isSaving ? "Сохранение…" : isEditing ? "Сохранить товар" : "Добавить товар"}
          </button>
        </div>
      </form>
    </div>
  );
}
