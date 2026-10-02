import { isTaskOverdue } from "./stalker-utils";
import type { Task } from "./types";

export type TaskDisplayStatus = "active" | "overdue" | "completed" | "cancelled";

export const taskDisplayStatusLabels: Record<TaskDisplayStatus, string> = {
  active: "Активно",
  overdue: "Просрочено",
  completed: "Выполнено",
  cancelled: "Отменено",
};

const taskDisplayStatusClasses: Record<TaskDisplayStatus, string> = {
  active: "badge-task-active",
  overdue: "badge-task-overdue",
  completed: "badge-task-completed",
  cancelled: "badge-task-cancelled",
};

export function getTaskDisplayStatus(task: Task): TaskDisplayStatus {
  if (task.status === "completed" || task.status === "cancelled") {
    return task.status;
  }

  return isTaskOverdue(task) ? "overdue" : "active";
}

export function getTaskStatusLabel(task: Task) {
  return taskDisplayStatusLabels[getTaskDisplayStatus(task)];
}

export function getTaskStatusClass(task: Task) {
  return taskDisplayStatusClasses[getTaskDisplayStatus(task)];
}
