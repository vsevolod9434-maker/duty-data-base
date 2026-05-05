import { journalEntries } from "./mock-data";
import type { JournalEntry, JournalEntryType } from "./types";

export const ACTIVITY_LOG_STORAGE_KEY = "duty-rp-activity-log";
export const ACTIVITY_LOG_UPDATED_EVENT = "duty-rp-activity-log-updated";

type ActivityLogEntryInput = {
  type?: JournalEntryType;
  title: string;
  status?: string;
  description?: string;
};

function createEntryTime(date: Date) {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isJournalEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<JournalEntry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.time === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.description === "string"
  );
}

export function readActivityLog(fallback: JournalEntry[] = journalEntries) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return fallback;
    }

    const entries = parsed.filter(isJournalEntry);

    return entries.length > 0 ? entries : fallback;
  } catch {
    return fallback;
  }
}

export function writeActivityLog(entries: JournalEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(ACTIVITY_LOG_UPDATED_EVENT));
}

export function addActivityLogEntry({
  type = "system",
  title,
  status = "OK",
  description = "",
}: ActivityLogEntryInput) {
  const now = new Date();
  const entry: JournalEntry = {
    id: `activity-log-${now.getTime()}`,
    type,
    time: createEntryTime(now),
    title,
    status,
    description,
    createdAt: now.toISOString(),
  };

  const currentEntries = readActivityLog([]);
  writeActivityLog([entry, ...currentEntries]);

  return entry;
}

export function clearActivityLog() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVITY_LOG_STORAGE_KEY);
  window.dispatchEvent(new Event(ACTIVITY_LOG_UPDATED_EVENT));
}
