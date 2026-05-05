import type { ReactNode } from "react";
import type { Task } from "@/lib/types";

type TaskRecordCardProps = {
  task: Task;
  assigneeLabel: string;
  statusLabel: string;
  statusClassName: string;
  formatDate: (value: string) => string;
  actions: ReactNode;
};

type DueTone = "future" | "today" | "overdue" | "neutral";

function parseCalendarDate(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const isoMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const russianMatch = trimmedValue.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (russianMatch) {
    const [, day, month, year] = russianMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
}

function getDueTone(value: string): DueTone {
  const dueDate = parseCalendarDate(value);

  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return "neutral";
  }

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (dueDate < todayDate) {
    return "overdue";
  }

  if (dueDate.getTime() === todayDate.getTime()) {
    return "today";
  }

  return "future";
}

export function getTaskActionVisibility(task: Task) {
  if (task.status === "active") {
    return {
      canEdit: true,
      canComplete: true,
      canCancel: true,
      canDelete: true,
    };
  }

  return {
    canEdit: false,
    canComplete: false,
    canCancel: false,
    canDelete: true,
  };
}

export function TaskRecordCard({
  task,
  assigneeLabel,
  statusLabel,
  statusClassName,
  formatDate,
  actions,
}: TaskRecordCardProps) {
  const dueTone = getDueTone(task.dueAt);

  return (
    <article className={`task-item profile-record-card task-record-card task-record-${task.status}`}>
      <div className="task-item-row task-record-header">
        <div className="task-item-mainline profile-record-title">
          <strong title={task.description}>{task.description || "Описание задания не указано"}</strong>
          <span className={`task-status-badge badge-chip ${statusClassName}`}>
            {statusLabel}
          </span>
          {task.assigneeType === "group" ? (
            <span className="task-status-badge badge-chip badge-state-group">Групповое</span>
          ) : null}
          <span className="profile-record-subtitle">
            Исполнитель: {assigneeLabel || "исполнитель не указан"}
          </span>
        </div>
        <div className="task-actions">{actions}</div>
      </div>

      <dl className="task-meta-strip profile-record-facts task-record-facts">
        <div>
          <dt>Дата выдачи</dt>
          <dd>{formatDate(task.issuedAt)}</dd>
        </div>
        <div>
          <dt>Выполнить до</dt>
          <dd className={`profile-record-emphasis profile-record-due profile-record-due-${dueTone}`}>
            {formatDate(task.dueAt)}
          </dd>
        </div>
        <div>
          <dt>Награда</dt>
          <dd className="profile-record-emphasis">{task.reward || "не указано"}</dd>
        </div>
        <div>
          <dt>Кто выдал</dt>
          <dd>{task.issuedBy || "не указано"}</dd>
        </div>
        <div>
          <dt>Кто принял</dt>
          <dd>{task.acceptedBy || "не указано"}</dd>
        </div>
      </dl>

      {task.notes ? (
        <div className="profile-notes-wide profile-record-notes">
          <span>Заметки</span>
          <p>{task.notes}</p>
        </div>
      ) : null}
    </article>
  );
}
