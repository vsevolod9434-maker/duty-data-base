import type {
  StalkerAffiliation,
  StalkerGroupRoleType,
  StalkerProfile,
  Task,
} from "./types";

export const PAGE_SIZE = 10;
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

export function readStoredCollection<T>(key: string, fallback: T[]) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredCollection<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
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

export function getProfileTitle(profile: StalkerProfile) {
  return profile.callsign || profile.fullName || "Без имени";
}

export function getProfileSecondaryTitle(profile: StalkerProfile) {
  return profile.callsign && profile.fullName ? profile.fullName : "";
}

export function getGroupRoleLabel(roleType: StalkerGroupRoleType, customRoleName: string | null) {
  return roleType === "custom" ? customRoleName || "Ручной ввод" : groupRoleLabels[roleType];
}

export function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function isTaskOverdue(task: Task) {
  if (task.status !== "active" || !task.dueAt) {
    return false;
  }

  return new Date(task.dueAt) < new Date(getTodayDate());
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
