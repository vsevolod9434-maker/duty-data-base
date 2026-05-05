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
    description: "Запущен локальный каркас системы учёта.",
  },
  {
    id: "journal-pda-ready",
    type: "system",
    time: "00:01",
    title: "Интерфейс КПК подготовлен",
    status: "OK",
    description: "Главная панель переведена в режим внутреннего КПК.",
  },
  {
    id: "journal-storage-wait",
    type: "system",
    time: "00:02",
    title: "Ожидается подключение постоянного хранилища",
    status: "WAIT",
    description: "База данных пока не подключена.",
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
