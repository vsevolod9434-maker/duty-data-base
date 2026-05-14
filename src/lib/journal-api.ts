import { apiFetch, apiFetchJson } from "@/lib/api-client";
import type { Task, TradeOperation, Violation } from "@/lib/types";

function normalizeNullableString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeNullableDate(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sanitizeTaskPayload(payload: Partial<Task>) {
  const safePayload = { ...payload };
  delete safePayload.acceptedBy;
  delete safePayload.issuedBy;
  return safePayload;
}

function sanitizeTradeOperationPayload(payload: Partial<TradeOperation>) {
  const safePayload = { ...payload };
  delete safePayload.issuedBy;
  return safePayload;
}

function sanitizeViolationPayload(payload: Partial<Violation>) {
  const safePayload = { ...payload };
  delete safePayload.issuedBy;
  return safePayload;
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
  const tasks = await apiFetchJson<Task[]>("/api/tasks");
  return tasks.map(normalizeTaskRecord);
}

export async function createTask(payload: Partial<Task>) {
  const task = await apiFetchJson<Task>("/api/tasks", {
    body: JSON.stringify(sanitizeTaskPayload(payload)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeTaskRecord(task);
}

export async function updateTask(taskId: string, payload: Partial<Task>) {
  const task = await apiFetchJson<Task>(`/api/tasks/${taskId}`, {
    body: JSON.stringify(sanitizeTaskPayload(payload)),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return normalizeTaskRecord(task);
}

export async function deleteTaskRecord(taskId: string) {
  await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" }, "Не удалось удалить задание.");
}

export async function importTasks(tasks: Task[]) {
  const payload = await apiFetchJson<{ tasks: Task[]; skippedLinks?: number }>("/api/tasks/import", {
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
  const operations = await apiFetchJson<TradeOperation[]>("/api/trade-operations");
  return operations.map(normalizeTradeOperation);
}

export async function createTradeOperation(payload: Partial<TradeOperation>) {
  const operation = await apiFetchJson<TradeOperation>("/api/trade-operations", {
    body: JSON.stringify(sanitizeTradeOperationPayload(payload)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeTradeOperation(operation);
}

export async function updateTradeOperation(operationId: string, payload: Partial<TradeOperation>) {
  const operation = await apiFetchJson<TradeOperation>(`/api/trade-operations/${operationId}`, {
    body: JSON.stringify(sanitizeTradeOperationPayload(payload)),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return normalizeTradeOperation(operation);
}

export async function deleteTradeOperationRecord(operationId: string) {
  await apiFetch(`/api/trade-operations/${operationId}`, { method: "DELETE" }, "Не удалось удалить торговую операцию.");
}

export async function importTradeOperations(tradeOperations: TradeOperation[]) {
  const payload = await apiFetchJson<{ tradeOperations: TradeOperation[]; skippedLinks?: number }>("/api/trade-operations/import", {
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
  const violations = await apiFetchJson<Violation[]>("/api/violations");
  return violations.map(normalizeViolationRecord);
}

export async function createViolation(payload: Partial<Violation>) {
  const violation = await apiFetchJson<Violation>("/api/violations", {
    body: JSON.stringify(sanitizeViolationPayload(payload)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeViolationRecord(violation);
}

export async function updateViolation(violationId: string, payload: Partial<Violation>) {
  const violation = await apiFetchJson<Violation>(`/api/violations/${violationId}`, {
    body: JSON.stringify(sanitizeViolationPayload(payload)),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
  return normalizeViolationRecord(violation);
}

export async function deleteViolationRecord(violationId: string) {
  await apiFetch(`/api/violations/${violationId}`, { method: "DELETE" }, "Не удалось удалить нарушение.");
}

export async function importViolations(violations: Violation[]) {
  const payload = await apiFetchJson<{ violations: Violation[]; skippedLinks?: number }>("/api/violations/import", {
    body: JSON.stringify(violations),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return {
    ...payload,
    violations: payload.violations.map(normalizeViolationRecord),
  };
}
