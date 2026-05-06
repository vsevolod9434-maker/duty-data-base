import type { Task, TradeOperation, Violation } from "@/lib/types";

type ApiErrorPayload = {
  error?: unknown;
};

async function readApiError(response: Response, fallbackMessage: string) {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return typeof payload?.error === "string" ? payload.error : fallbackMessage;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(await readApiError(response, "Сервер вернул ошибку."));
  }

  return (await response.json()) as T;
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeNullableDate(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function normalizeTaskRecord(task: Task): Task {
  return {
    ...task,
    stalkerId: task.stalkerId ?? null,
    groupId: task.groupId ?? null,
    manualAssigneeName: normalizeNullableString(task.manualAssigneeName),
    dueAt: normalizeNullableDate(task.dueAt),
    reward: normalizeNullableString(task.reward),
    notes: normalizeNullableString(task.notes),
    issuedBy: normalizeNullableString(task.issuedBy),
    acceptedBy: task.acceptedBy ?? null,
    completedAt: task.completedAt ?? null,
    createdAt: normalizeNullableDate(task.createdAt),
    updatedAt: normalizeNullableDate(task.updatedAt),
  };
}

export function normalizeTradeOperation(operation: TradeOperation): TradeOperation {
  return {
    ...operation,
    stalkerId: operation.stalkerId ?? null,
    groupId: operation.groupId ?? null,
    manualParticipantName: normalizeNullableString(operation.manualParticipantName),
    items: operation.items.map((item) => ({
      ...item,
      notes: normalizeNullableString(item.notes),
    })),
    issuedBy: normalizeNullableString(operation.issuedBy),
    notes: normalizeNullableString(operation.notes),
    operationDate: normalizeNullableDate(operation.operationDate),
    updatedAt: normalizeNullableDate(operation.updatedAt),
  };
}

export function normalizeViolationRecord(violation: Violation): Violation {
  return {
    ...violation,
    profileId: normalizeNullableString(violation.profileId),
    manualViolatorName: normalizeNullableString(violation.manualViolatorName),
    status: violation.status ?? "active",
    closedAt: normalizeNullableDate(violation.closedAt),
    closureNote: normalizeNullableString(violation.closureNote),
    issuedBy: normalizeNullableString(violation.issuedBy),
    notes: normalizeNullableString(violation.notes),
  };
}

export async function fetchTasks() {
  const tasks = await fetchJson<Task[]>("/api/tasks");
  return tasks.map(normalizeTaskRecord);
}

export async function createTask(payload: Partial<Task>) {
  const task = await fetchJson<Task>("/api/tasks", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeTaskRecord(task);
}

export async function updateTask(taskId: string, payload: Partial<Task>) {
  const task = await fetchJson<Task>(`/api/tasks/${taskId}`, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return normalizeTaskRecord(task);
}

export async function deleteTaskRecord(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Не удалось удалить задание."));
  }
}

export async function importTasks(tasks: Task[]) {
  const payload = await fetchJson<{ tasks: Task[]; skippedLinks?: number }>("/api/tasks/import", {
    body: JSON.stringify(tasks),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return {
    ...payload,
    tasks: payload.tasks.map(normalizeTaskRecord),
  };
}

export async function fetchTradeOperations() {
  const operations = await fetchJson<TradeOperation[]>("/api/trade-operations");
  return operations.map(normalizeTradeOperation);
}

export async function createTradeOperation(payload: Partial<TradeOperation>) {
  const operation = await fetchJson<TradeOperation>("/api/trade-operations", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeTradeOperation(operation);
}

export async function updateTradeOperation(operationId: string, payload: Partial<TradeOperation>) {
  const operation = await fetchJson<TradeOperation>(`/api/trade-operations/${operationId}`, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return normalizeTradeOperation(operation);
}

export async function deleteTradeOperationRecord(operationId: string) {
  const response = await fetch(`/api/trade-operations/${operationId}`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Не удалось удалить торговую операцию."));
  }
}

export async function importTradeOperations(tradeOperations: TradeOperation[]) {
  const payload = await fetchJson<{ tradeOperations: TradeOperation[]; skippedLinks?: number }>("/api/trade-operations/import", {
    body: JSON.stringify(tradeOperations),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return {
    ...payload,
    tradeOperations: payload.tradeOperations.map(normalizeTradeOperation),
  };
}

export async function fetchViolations() {
  const violations = await fetchJson<Violation[]>("/api/violations");
  return violations.map(normalizeViolationRecord);
}

export async function createViolation(payload: Partial<Violation>) {
  const violation = await fetchJson<Violation>("/api/violations", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeViolationRecord(violation);
}

export async function updateViolation(violationId: string, payload: Partial<Violation>) {
  const violation = await fetchJson<Violation>(`/api/violations/${violationId}`, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return normalizeViolationRecord(violation);
}

export async function deleteViolationRecord(violationId: string) {
  const response = await fetch(`/api/violations/${violationId}`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await readApiError(response, "Не удалось удалить нарушение."));
  }
}

export async function importViolations(violations: Violation[]) {
  const payload = await fetchJson<{ violations: Violation[]; skippedLinks?: number }>("/api/violations/import", {
    body: JSON.stringify(violations),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return {
    ...payload,
    violations: payload.violations.map(normalizeViolationRecord),
  };
}
