import type {
  Apartment,
  DutyMember,
  JournalEntry,
  StalkerGroup,
  StalkerProfile,
  Task,
  TradeOperation,
} from "./types";

export const stalkerProfiles: StalkerProfile[] = [];

export const stalkerGroups: StalkerGroup[] = [];

export const apartments: Apartment[] = [];

export const tasks: Task[] = [];

export const tradeOperations: TradeOperation[] = [];

export const dutyMembers: DutyMember[] = [];

export const journalEntries: JournalEntry[] = [
  {
    id: "journal-system-init",
    type: "system",
    time: "00:00",
    title: "Боевая подготовка",
    status: "OK",
    description: "Система учёта готова к работе.",
  },
  {
    id: "journal-pda-ready",
    type: "system",
    time: "00:01",
    title: "Главная панель подготовлена",
    status: "OK",
    description: "Служебный интерфейс готов к работе.",
  },
  {
    id: "journal-storage-wait",
    type: "system",
    time: "00:02",
    title: "Оперативный журнал активен",
    status: "OK",
    description: "Записи действий фиксируются в журнале.",
  },
];

export const dashboardSummary = {
  stalkersCount: stalkerProfiles.length,
  activeGroupsCount: stalkerGroups.filter((group) => group.status === "active")
    .length,
  occupiedApartmentsCount: apartments.filter(
    (apartment) => apartment.status === "occupied",
  ).length,
  activeTasksCount: tasks.filter((task) => task.status === "active").length,
};
