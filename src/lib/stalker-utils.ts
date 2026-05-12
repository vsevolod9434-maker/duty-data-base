import type {
  StalkerAffiliation,
  StalkerGroupRoleType,
  StalkerProfile,
  Task,
} from "./types";

export const PAGE_SIZE = 10;
const REAL_WORLD_SYSTEM_YEAR_BASE = 2026;
const SYSTEM_YEAR_BASE = 2009;

export function getSystemYear(referenceDate = new Date()) {
  return SYSTEM_YEAR_BASE + (referenceDate.getFullYear() - REAL_WORLD_SYSTEM_YEAR_BASE);
}

export const SYSTEM_YEAR = getSystemYear();
export const SYSTEM_DATE_MIN = `${SYSTEM_YEAR}-01-01`;
export const SYSTEM_DATE_MAX = `${SYSTEM_YEAR}-12-31`;
export const STALKER_PROFILES_STORAGE_KEY = "duty-rp-db:stalker-profiles";
export const STALKER_TASKS_STORAGE_KEY = "duty-rp-db:stalker-tasks";
export const STALKER_GROUPS_STORAGE_KEY = "duty-rp-db:stalker-groups";
export const TRADE_OPERATIONS_STORAGE_KEY = "duty-rp-db:trade-operations";
export const VIOLATIONS_STORAGE_KEY = "duty-rp-db:violations";
export const APARTMENTS_STORAGE_KEY = "duty-rp-db:apartments";
export const DUTY_MEMBERS_STORAGE_KEY = "duty-rp-db:duty-members";

export const affiliationLabels: Record<StalkerAffiliation, string> = {
  loner: "Одиночка",
  duty: "Долг",
  freedom: "Свобода",
  gopnik: "Гопник",
  bandit: "Бандит",
  mercenary: "Наёмник",
  military: "Военный",
  clear_sky: "Чистое Небо",
};

export const groupRoleLabels: Record<StalkerGroupRoleType, string> = {
  leader: "Лидер",
  member: "Участник",
  custom: "Ручной ввод",
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function padMilliseconds(value: number) {
  return String(value).padStart(3, "0");
}

function shouldNormalizeDateField(key: string) {
  if (key === "birthDate") {
    return false;
  }

  return key === "date" || key === "paidUntil" || key === "dueAt" || key === "operationDate" || key.endsWith("At");
}

function formatSystemDateValue(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function formatSystemTimestampValue(date: Date) {
  return `${formatSystemDateValue(date)}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(
    date.getSeconds(),
  )}.${padMilliseconds(date.getMilliseconds())}`;
}

export function createSystemDate(base = new Date()) {
  const nextDate = new Date(base.getTime());
  nextDate.setFullYear(getSystemYear());
  return nextDate;
}

export function parseSystemDate(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const isoMatch = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?/,
  );

  if (isoMatch) {
    const [, year, month, day, hours = "0", minutes = "0", seconds = "0", milliseconds = "0"] = isoMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
      Number(milliseconds.padEnd(3, "0")),
    );
  }

  const russianMatch = trimmedValue.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (russianMatch) {
    const [, day, month, year] = russianMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

export function forceSystemYear(value: string) {
  const parsedDate = parseSystemDate(value);

  if (!parsedDate) {
    return value;
  }

  const normalizedDate = createSystemDate(parsedDate);
  const hasTime = /[T\s]\d{2}:\d{2}/.test(value);

  return hasTime ? formatSystemTimestampValue(normalizedDate) : formatSystemDateValue(normalizedDate);
}

export function normalizeSystemDates<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSystemDates(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, currentValue]) => {
        if (typeof currentValue === "string" && shouldNormalizeDateField(key)) {
          return [key, forceSystemYear(currentValue)];
        }

        return [key, normalizeSystemDates(currentValue)];
      }),
    ) as T;
  }

  return value;
}

export function getSystemTimestamp() {
  return formatSystemTimestampValue(createSystemDate(new Date()));
}

export function getSystemToday() {
  return new Date(`${getTodayDate()}T00:00:00`);
}

export function readStoredCollection<T>(key: string, fallback: T[]) {
  if (typeof window === "undefined") {
    return normalizeSystemDates(fallback);
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return normalizeSystemDates(fallback);
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? normalizeSystemDates(parsed as T[]) : normalizeSystemDates(fallback);
  } catch {
    return normalizeSystemDates(fallback);
  }
}

export function writeStoredCollection<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  const serializedValue = JSON.stringify(normalizeSystemDates(value));

  if (window.localStorage.getItem(key) === serializedValue) {
    return;
  }

  window.localStorage.setItem(key, serializedValue);
}

export function getPageCount(totalItems: number) {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
}

export function clampPage(page: number, totalItems: number) {
  return Math.min(Math.max(1, page), getPageCount(totalItems));
}

export function getPaginatedItems<T>(items: T[], page: number) {
  const safePage = clampPage(page, items.length);
  const start = (safePage - 1) * PAGE_SIZE;

  return {
    items: items.slice(start, start + PAGE_SIZE),
    page: safePage,
    pageCount: getPageCount(items.length),
  };
}

export function getAffiliationLabel(affiliation?: StalkerAffiliation) {
  return affiliation ? affiliationLabels[affiliation] : "Не указана";
}

export function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("ru-RU");
}

export function getStalkerPrimaryLabel(profile: StalkerProfile) {
  const callsign = profile.callsign.trim();
  const fullName = profile.fullName.trim();

  return callsign || fullName || "Без имени";
}

export function getStalkerSecondaryLabel(profile: StalkerProfile) {
  const callsign = profile.callsign.trim();
  const fullName = profile.fullName.trim();

  return callsign && fullName ? fullName : "";
}

export function matchesStalkerProfileSearch(profile: StalkerProfile, query: string) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  return [
    getStalkerPrimaryLabel(profile),
    getStalkerSecondaryLabel(profile),
    profile.registryNumber,
    profile.callsign,
    profile.fullName,
  ]
    .some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function getProfileTitle(profile: StalkerProfile) {
  return getStalkerPrimaryLabel(profile);
}

export function getProfileSecondaryTitle(profile: StalkerProfile) {
  return getStalkerSecondaryLabel(profile);
}

export function getGroupRoleLabel(roleType: StalkerGroupRoleType, customRoleName: string | null) {
  return roleType === "custom" ? customRoleName || "Ручной ввод" : groupRoleLabels[roleType];
}

export function getTodayDate() {
  return formatSystemDateValue(createSystemDate(new Date()));
}

export function isTaskOverdue(task: Task) {
  if (task.status !== "active" || !task.dueAt) {
    return false;
  }

  return new Date(task.dueAt) < getSystemToday();
}

export function getAffiliationBadgeClass(affiliation?: StalkerAffiliation) {
  switch (affiliation) {
    case "loner":
      return "badge-affiliation-loner";
    case "duty":
      return "badge-affiliation-duty";
    case "freedom":
      return "badge-affiliation-freedom";
    case "gopnik":
      return "badge-affiliation-gopnik";
    case "bandit":
      return "badge-affiliation-bandit";
    case "mercenary":
      return "badge-affiliation-mercenary";
    case "military":
      return "badge-affiliation-military";
    case "clear_sky":
      return "badge-affiliation-clear-sky";
    default:
      return "badge-neutral";
  }
}

export function getProfileStateBadgeClass(
  tone: "archive" | "group" | "task-active" | "task-overdue" | "task-completed",
) {
  const classMap = {
    archive: "badge-state-archive",
    group: "badge-state-group",
    "task-active": "badge-task-active",
    "task-overdue": "badge-task-overdue",
    "task-completed": "badge-task-completed",
  } as const;

  return classMap[tone];
}
