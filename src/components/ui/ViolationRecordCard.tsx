import type { ReactNode } from "react";
import type { Violation } from "@/lib/types";

type ViolationRecordCardProps = {
  violation: Violation;
  violatorLabel: string;
  statusLabel: string;
  statusClassName: string;
  isActive: boolean;
  formatDate: (value: string) => string;
  actions: ReactNode;
  violatorTypeLabel?: string;
};

export function ViolationRecordCard({
  violation,
  violatorLabel,
  statusLabel,
  statusClassName,
  isActive,
  formatDate,
  actions,
}: ViolationRecordCardProps) {
  return (
    <article className={`task-item profile-record-card violation-record-card ${isActive ? "profile-record-alert" : "profile-record-muted"}`}>
      <div className="task-item-row task-record-header">
        <div className="task-item-mainline profile-record-title">
          <strong title={violation.description}>{violation.description || "Описание нарушения не указано"}</strong>
          <span className={`task-status-badge badge-chip ${statusClassName}`}>
            {statusLabel}
          </span>
          <span className="profile-record-subtitle">
            Нарушитель: {violatorLabel || "нарушитель не указан"}
          </span>
        </div>
        <div className="task-actions">{actions}</div>
      </div>

      <dl className="task-meta-strip profile-record-facts violation-record-facts">
        <div>
          <dt>Дата нарушения</dt>
          <dd>{formatDate(violation.date)}</dd>
        </div>
        <div>
          <dt>Кто оформил</dt>
          <dd>{violation.issuedBy || "не указано"}</dd>
        </div>
        {violation.closedAt ? (
          <div>
            <dt>Дата закрытия</dt>
            <dd>{formatDate(violation.closedAt)}</dd>
          </div>
        ) : null}
      </dl>

      {violation.closureNote ? (
        <div className="profile-notes-wide profile-record-notes">
          <span>Что сделал сталкер</span>
          <p>{violation.closureNote}</p>
        </div>
      ) : null}

      {violation.notes ? (
        <div className="profile-notes-wide profile-record-notes">
          <span>Заметки</span>
          <p>{violation.notes}</p>
        </div>
      ) : null}
    </article>
  );
}
