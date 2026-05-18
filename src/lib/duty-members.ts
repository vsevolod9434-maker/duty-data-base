import type { UserRole } from "@/lib/auth-roles";

const dutyRankOrder = [
  "Генерал",
  "Полковник",
  "Подполковник",
  "Майор",
  "Капитан",
  "Старший лейтенант",
  "Лейтенант",
  "Младший лейтенант",
  "Старший прапорщик",
  "Прапорщик",
  "Старшина",
  "Старший сержант",
  "Сержант",
  "Младший сержант",
  "Ефрейтор",
  "Рядовой",
] as const;

const rankPriority = new Map(dutyRankOrder.map((rank, index) => [normalizeRank(rank), index]));

function normalizeRank(rank: string | null | undefined) {
  return (rank ?? "").trim().toLocaleLowerCase("ru-RU");
}

function compareByFullName(aFullName: string, bFullName: string) {
  return aFullName.localeCompare(bFullName, "ru-RU");
}

export function getDutyAccessLevelLabel(role: UserRole) {
  if (role === "officer") {
    return "Офицерский допуск";
  }

  if (role === "manager" || role === "regular") {
    return "Базовый допуск";
  }

  return "Системный доступ";
}

export function isDutyMemberVisibleRole(role: UserRole) {
  return role !== "system_admin";
}

export function compareDutyMembersByRankAndName<T extends { fullName: string; id: string; rank: string | null }>(left: T, right: T) {
  const leftPriority = rankPriority.get(normalizeRank(left.rank)) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = rankPriority.get(normalizeRank(right.rank)) ?? Number.MAX_SAFE_INTEGER;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const nameComparison = compareByFullName(left.fullName, right.fullName);

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.id.localeCompare(right.id, "ru-RU");
}
