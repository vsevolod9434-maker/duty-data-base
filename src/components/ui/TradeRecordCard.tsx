import type { ReactNode } from "react";
import type { TradeOperation } from "@/lib/types";

type TradeRecordCardProps = {
  operation: TradeOperation;
  participantLabel: string;
  formatDate: (value: string) => string;
  formatMoney: (value: number) => string;
  actions: ReactNode;
  participantRoleLabel?: string;
  typeLabel?: string;
};

function getTradeItemsTitle(operation: TradeOperation) {
  const firstItem = operation.items[0];
  const firstItemName = firstItem?.name || "Предмет не указан";

  if (operation.items.length <= 1) {
    return firstItemName;
  }

  return `${firstItemName} и ещё ${operation.items.length - 1}`;
}

function getQuantityLabel(operation: TradeOperation) {
  const firstItem = operation.items[0];

  if (!firstItem) {
    return "не указано";
  }

  if (operation.items.length === 1) {
    return String(firstItem.quantity);
  }

  const totalQuantity = operation.items.reduce((sum, item) => sum + item.quantity, 0);
  return `${totalQuantity} шт. в ${operation.items.length} позициях`;
}

export function TradeRecordCard({
  operation,
  participantLabel,
  formatDate,
  formatMoney,
  actions,
  participantRoleLabel,
  typeLabel,
}: TradeRecordCardProps) {
  const isSale = operation.type === "sale";
  const firstItem = operation.items[0];
  const resolvedTypeLabel = typeLabel ?? (isSale ? "Продажа" : "Покупка");
  const resolvedParticipantRoleLabel = participantRoleLabel ?? (isSale ? "Покупатель" : "Продавец");
  const resolvedParticipantLabel = participantLabel || "участник не указан";

  return (
    <article className={`task-item profile-record-card trade-record-card trade-record-${operation.type}`}>
      <div className="task-item-row task-record-header">
        <div className="task-item-mainline profile-record-title">
          <strong>{getTradeItemsTitle(operation)}</strong>
          <span className={`task-status-badge badge-chip trade-record-type-badge ${isSale ? "trade-record-sale-badge" : "trade-record-purchase-badge"}`}>
            {resolvedTypeLabel}
          </span>
          <span className="profile-record-subtitle">
            {resolvedParticipantRoleLabel}: {resolvedParticipantLabel}
          </span>
        </div>
        <div className="task-actions">{actions}</div>
      </div>

      <dl className="task-meta-strip profile-record-facts trade-record-facts">
        <div>
          <dt>Дата операции</dt>
          <dd>{formatDate(operation.operationDate ?? operation.createdAt)}</dd>
        </div>
        <div>
          <dt>Количество</dt>
          <dd>{getQuantityLabel(operation)}</dd>
        </div>
        <div>
          <dt>Цена</dt>
          <dd>{firstItem ? formatMoney(firstItem.price) : "не указано"}</dd>
        </div>
        <div>
          <dt>Общая сумма</dt>
          <dd className="profile-record-emphasis">{formatMoney(operation.totalAmount)}</dd>
        </div>
        <div>
          <dt>Кто оформил</dt>
          <dd>{operation.issuedBy || "не указано"}</dd>
        </div>
      </dl>

      {operation.items.length > 1 ? (
        <div className="profile-record-items">
          <span>Позиции операции</span>
          {operation.items.map((item) => (
            <div key={item.id}>
              <strong>{item.name || "Предмет не указан"}</strong>
              <span>
                {item.quantity} по {formatMoney(item.price)} = {formatMoney(item.quantity * item.price)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {operation.notes ? (
        <div className="profile-notes-wide profile-record-notes">
          <span>Заметки</span>
          <p>{operation.notes}</p>
        </div>
      ) : null}
    </article>
  );
}
