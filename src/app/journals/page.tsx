"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TaskRecordCard } from "@/components/ui/TaskRecordCard";
import { TradeRecordCard } from "@/components/ui/TradeRecordCard";
import { ViolationRecordCard } from "@/components/ui/ViolationRecordCard";
import { addActivityLogEntry } from "@/lib/activity-log";
import {
  createTask,
  createTradeOperation,
  createViolation,
  deleteTaskRecord,
  deleteTradeOperationRecord,
  deleteViolationRecord,
  fetchTasks,
  fetchTradeOperations,
  fetchViolations,
  importTasks,
  importTradeOperations,
  importViolations,
  updateTask,
  updateTradeOperation,
  updateViolation,
} from "@/lib/journal-api";
import {
  stalkerGroups as initialStalkerGroups,
  stalkerProfiles as initialStalkerProfiles,
  tasks as initialTasks,
  tradeOperations as initialTradeOperations,
} from "@/lib/mock-data";
import type {
  StalkerGroup,
  StalkerProfile,
  Task,
  TaskAssigneeType,
  TaskStatus,
  TradeOperation,
  TradeSubjectType,
  TradeType,
  Violation,
  ViolationSubjectType,
} from "@/lib/types";
import {
  forceSystemYear,
  getAffiliationLabel,
  getPaginatedItems,
  getProfileSecondaryTitle,
  getProfileTitle,
  getSystemTimestamp,
  getTodayDate,
  readStoredCollection,
  SYSTEM_DATE_MAX,
  SYSTEM_DATE_MIN,
  STALKER_GROUPS_STORAGE_KEY,
  STALKER_PROFILES_STORAGE_KEY,
  STALKER_TASKS_STORAGE_KEY,
  TRADE_OPERATIONS_STORAGE_KEY,
  VIOLATIONS_STORAGE_KEY,
  writeStoredCollection,
} from "@/lib/stalker-utils";

const journalTabs = ["Задания", "Продажи", "Покупки", "Нарушения"] as const;
type JournalTab = (typeof journalTabs)[number];

const taskStatusFilters = [
  { label: "Активные", value: "active" },
  { label: "Выполненные", value: "completed" },
  { label: "Отменённые", value: "cancelled" },
  { label: "Все", value: "all" },
] as const;

const violationStatusFilters = [
  { label: "Активные", value: "active" },
  { label: "Погашенные", value: "closed" },
  { label: "Все", value: "all" },
] as const;

type TaskStatusFilter = (typeof taskStatusFilters)[number]["value"];
type ViolationStatusFilter = (typeof violationStatusFilters)[number]["value"];
type TaskAssigneeMode = TaskAssigneeType;
type TradeParticipantMode = TradeSubjectType;
type ViolationMode = ViolationSubjectType;
type EntitySearchState = {
  query: string;
  appliedQuery: string;
  hasSearched: boolean;
};

type EntitySearchResult = {
  id: string;
  title: string;
  description: string;
  meta?: string;
};

async function fetchReferenceCollection<T>(url: string, fallback: T[]) {
  const response = await fetch(url);

  if (!response.ok) {
    return fallback;
  }

  return ((await response.json()) as T[]).map((item) => normalizeReferenceRecord(item));
}

function normalizeReferenceRecord<T>(item: T): T {
  if (!item || typeof item !== "object") {
    return item;
  }

  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [key, value ?? (key === "members" ? [] : "")]),
  ) as T;
}

type JournalConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  confirmTone?: "primary" | "warning" | "danger";
  onConfirm: () => void;
} | null;

const taskStatusLabels: Record<TaskStatus, string> = {
  active: "Активно",
  completed: "Выполнено",
  cancelled: "Отменено",
};

const tradeTypeLabels: Record<TradeType, string> = {
  sale: "Продажа",
  purchase: "Покупка",
};

const journalDescriptions: Record<JournalTab, string> = {
  Задания: "Выдача, контроль сроков и закрытие рабочих заданий.",
  Продажи: "Предметы, которые «Долг» продаёт сталкерам, группам или вручную указанным покупателям.",
  Покупки: "Предметы, которые «Долг» покупает у сталкеров, групп или вручную указанных продавцов.",
  Нарушения: "Фиксация активных и закрытых нарушений по сталкерским профилям и ручным записям.",
};

function createEmptyTaskDraft() {
  return {
    assigneeMode: "stalker" as TaskAssigneeMode,
    stalkerId: "",
    groupId: "",
    manualAssigneeName: "",
    issuedAt: getTodayDate(),
    dueAt: "",
    description: "",
    reward: "",
    notes: "",
    issuedBy: "",
    acceptedBy: "",
  };
}

function createEmptyTradeDraft(type: TradeType) {
  return {
    type,
    participantMode: "stalker" as TradeParticipantMode,
    stalkerId: "",
    groupId: "",
    manualParticipantName: "",
    itemName: "",
    quantity: "1",
    price: "",
    issuedBy: "",
    notes: "",
    operationDate: getTodayDate(),
  };
}

function createEmptyViolationDraft() {
  return {
    violatorType: "profile" as ViolationMode,
    profileId: "",
    manualViolatorName: "",
    date: getTodayDate(),
    description: "",
    issuedBy: "",
    notes: "",
  };
}

function createEntitySearchState(): EntitySearchState {
  return {
    query: "",
    appliedQuery: "",
    hasSearched: false,
  };
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "не указано";
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} руб.`;
}

function SearchableEntityPicker({
  title,
  placeholder,
  query,
  selectedLabel,
  selectedPrefix = "Выбрано",
  results,
  hasSearched,
  appliedQuery,
  disabled,
  onApply,
  onQueryChange,
  onReset,
  onSelect,
}: {
  title: string;
  placeholder: string;
  query: string;
  selectedLabel: string;
  selectedPrefix?: string;
  results: EntitySearchResult[];
  hasSearched: boolean;
  appliedQuery: string;
  disabled?: boolean;
  onApply: () => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onSelect: (id: string) => void;
}) {
  const showEmptyQueryMessage = hasSearched && !appliedQuery.trim();
  const showNothingFoundMessage = hasSearched && Boolean(appliedQuery.trim()) && results.length === 0;

  return (
    <div className="entity-search-picker task-form-wide">
      <label className="filter-field entity-search-field">
        <span>{title}</span>
        <div className="entity-search-row">
          <input
            disabled={disabled}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onApply();
              }
            }}
            placeholder={placeholder}
            type="text"
            value={query}
          />
          <button className="command-row task-action-button" disabled={disabled} onClick={onApply} type="button">
            Применить
          </button>
        </div>
      </label>

      {selectedLabel ? (
        <div className="entity-selected-row">
          <span>{selectedPrefix}: {selectedLabel}</span>
          <button className="command-row task-action-button" disabled={disabled} onClick={onReset} type="button">
            Сбросить
          </button>
        </div>
      ) : null}

      {showEmptyQueryMessage ? (
        <div className="entity-search-empty">Введите запрос для поиска.</div>
      ) : null}

      {showNothingFoundMessage ? (
        <div className="entity-search-empty">Ничего не найдено.</div>
      ) : null}

      {results.length > 0 ? (
        <div className="entity-search-results">
          {results.map((result) => (
            <button className="entity-search-result" key={result.id} onClick={() => onSelect(result.id)} type="button">
              <span>
                <strong>{result.title}</strong>
                <small>{result.description}</small>
              </span>
              {result.meta ? <em>{result.meta}</em> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getTaskStatusClass(status: TaskStatus) {
  if (status === "completed") {
    return "badge-task-completed";
  }

  if (status === "cancelled") {
    return "badge-task-cancelled";
  }

  return "badge-task-active";
}

function getViolationStatus(violation: Violation) {
  return violation.status ?? "active";
}

function isViolationActive(violation: Violation) {
  return getViolationStatus(violation) === "active";
}

function getViolationStatusLabel(violation: Violation) {
  return isViolationActive(violation) ? "Активное нарушение" : "Закрыто";
}

function getViolationStatusClass(violation: Violation) {
  return isViolationActive(violation) ? "badge-violation-active" : "badge-violation-closed";
}

export default function JournalsPage() {
  const [activeJournalTab, setActiveJournalTab] = useState<JournalTab>("Задания");
  const [profiles, setProfiles] = useState<StalkerProfile[]>([]);
  const [groups, setGroups] = useState<StalkerGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tradeOperations, setTradeOperations] = useState<TradeOperation[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [isJournalLoading, setIsJournalLoading] = useState(false);
  const [journalLoadMessage, setJournalLoadMessage] = useState("");
  const [localImportTasks, setLocalImportTasks] = useState<Task[]>([]);
  const [localImportTradeOperations, setLocalImportTradeOperations] = useState<TradeOperation[]>([]);
  const [localImportViolations, setLocalImportViolations] = useState<Violation[]>([]);
  const [journalImportMessage, setJournalImportMessage] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>("active");
  const [violationStatusFilter, setViolationStatusFilter] = useState<ViolationStatusFilter>("all");
  const [taskPage, setTaskPage] = useState(1);
  const [salePage, setSalePage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const [violationPage, setViolationPage] = useState(1);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [tradeModalType, setTradeModalType] = useState<TradeType | null>(null);
  const [editingTradeId, setEditingTradeId] = useState("");
  const [isViolationModalOpen, setIsViolationModalOpen] = useState(false);
  const [editingViolationId, setEditingViolationId] = useState("");
  const [completingTaskId, setCompletingTaskId] = useState("");
  const [closingViolationId, setClosingViolationId] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<JournalConfirmDialogState>(null);
  const [taskDraft, setTaskDraft] = useState(createEmptyTaskDraft);
  const [tradeDraft, setTradeDraft] = useState(() => createEmptyTradeDraft("sale"));
  const [violationDraft, setViolationDraft] = useState(createEmptyViolationDraft);
  const [taskFormMessage, setTaskFormMessage] = useState("");
  const [taskTableMessage, setTaskTableMessage] = useState("");
  const [completeTaskMessage, setCompleteTaskMessage] = useState("");
  const [tradeFormMessage, setTradeFormMessage] = useState("");
  const [saleTableMessage, setSaleTableMessage] = useState("");
  const [purchaseTableMessage, setPurchaseTableMessage] = useState("");
  const [violationFormMessage, setViolationFormMessage] = useState("");
  const [violationTableMessage, setViolationTableMessage] = useState("");
  const [completeTaskAcceptedBy, setCompleteTaskAcceptedBy] = useState("");
  const [violationClosureNote, setViolationClosureNote] = useState("");
  const [violationClosureMessage, setViolationClosureMessage] = useState("");
  const [taskStalkerSearch, setTaskStalkerSearch] = useState(createEntitySearchState);
  const [taskGroupSearch, setTaskGroupSearch] = useState(createEntitySearchState);
  const [tradeStalkerSearch, setTradeStalkerSearch] = useState(createEntitySearchState);
  const [tradeGroupSearch, setTradeGroupSearch] = useState(createEntitySearchState);
  const [violationProfileSearch, setViolationProfileSearch] = useState(createEntitySearchState);

  useEffect(() => {
    let isCancelled = false;

    const storageReadHandle = window.setTimeout(() => {
      const localProfiles = readStoredCollection<StalkerProfile>(STALKER_PROFILES_STORAGE_KEY, initialStalkerProfiles);
      const localGroups = readStoredCollection<StalkerGroup>(STALKER_GROUPS_STORAGE_KEY, initialStalkerGroups);
      const localTasks = readStoredCollection<Task>(STALKER_TASKS_STORAGE_KEY, initialTasks);
      const localTradeOperations = readStoredCollection<TradeOperation>(TRADE_OPERATIONS_STORAGE_KEY, initialTradeOperations);
      const localViolations = readStoredCollection<Violation>(VIOLATIONS_STORAGE_KEY, []);

      setProfiles(localProfiles);
      setGroups(localGroups);
      setTasks(localTasks);
      setTradeOperations(localTradeOperations);
      setViolations(localViolations);

      async function loadJournalData() {
        setIsJournalLoading(true);
        setJournalLoadMessage("");

        try {
          const [serverProfiles, serverGroups, serverTasks, serverTradeOperations, serverViolations] = await Promise.all([
            fetchReferenceCollection<StalkerProfile>("/api/stalkers", localProfiles),
            fetchReferenceCollection<StalkerGroup>("/api/stalker-groups", localGroups),
            fetchTasks(),
            fetchTradeOperations(),
            fetchViolations(),
          ]);

          if (isCancelled) {
            return;
          }

          setProfiles(serverProfiles);
          setGroups(serverGroups);
          setTasks(serverTasks);
          setTradeOperations(serverTradeOperations);
          setViolations(serverViolations);

          if (serverTasks.length > 0) {
            setLocalImportTasks([]);
          } else if (localTasks.length > 0) {
            setLocalImportTasks(localTasks);
          }

          if (serverTradeOperations.length > 0) {
            setLocalImportTradeOperations([]);
          } else if (localTradeOperations.length > 0) {
            setLocalImportTradeOperations(localTradeOperations);
          }

          if (serverViolations.length > 0) {
            setLocalImportViolations([]);
          } else if (localViolations.length > 0) {
            setLocalImportViolations(localViolations);
          }

          writeStoredCollection(STALKER_PROFILES_STORAGE_KEY, serverProfiles);
          writeStoredCollection(STALKER_GROUPS_STORAGE_KEY, serverGroups);
          writeStoredCollection(STALKER_TASKS_STORAGE_KEY, serverTasks);
          writeStoredCollection(TRADE_OPERATIONS_STORAGE_KEY, serverTradeOperations);
          writeStoredCollection(VIOLATIONS_STORAGE_KEY, serverViolations);
        } catch {
          if (isCancelled) {
            return;
          }

          setJournalLoadMessage(
            "Не удалось загрузить журналы.",
          );
        } finally {
          if (!isCancelled) {
            setIsStorageReady(true);
            setIsJournalLoading(false);
          }
        }
      }

      void loadJournalData();
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(storageReadHandle);
    };
  }, []);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    if (tasks.length === 0 && localImportTasks.length > 0) {
      return;
    }

    writeStoredCollection(STALKER_TASKS_STORAGE_KEY, tasks);
  }, [isStorageReady, localImportTasks.length, tasks]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    if (tradeOperations.length === 0 && localImportTradeOperations.length > 0) {
      return;
    }

    writeStoredCollection(TRADE_OPERATIONS_STORAGE_KEY, tradeOperations);
  }, [isStorageReady, localImportTradeOperations.length, tradeOperations]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    if (violations.length === 0 && localImportViolations.length > 0) {
      return;
    }

    writeStoredCollection(VIOLATIONS_STORAGE_KEY, violations);
  }, [isStorageReady, localImportViolations.length, violations]);

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const groupById = useMemo(() => {
    return new Map(groups.map((group) => [group.id, group]));
  }, [groups]);

  const activeProfiles = useMemo(() => {
    return profiles.filter((profile) => profile.status === "active");
  }, [profiles]);

  const activeGroups = useMemo(() => {
    return groups.filter((group) => group.status === "active");
  }, [groups]);

  async function importLocalTasks() {
    setJournalImportMessage("");
    try {
      const result = await importTasks(localImportTasks);
      setTasks(result.tasks);
      setLocalImportTasks([]);
      setJournalImportMessage(
        result.skippedLinks
          ? `Задания импортированы. Записей с отсутствующими связями: ${result.skippedLinks}.`
          : "Задания импортированы.",
      );
    } catch {
      setJournalImportMessage("Не удалось выполнить импорт заданий.");
    }
  }

  async function importLocalTradeOperations() {
    setJournalImportMessage("");
    try {
      const result = await importTradeOperations(localImportTradeOperations);
      setTradeOperations(result.tradeOperations);
      setLocalImportTradeOperations([]);
      setJournalImportMessage(
        result.skippedLinks
          ? `Торговые операции импортированы. Записей с отсутствующими связями: ${result.skippedLinks}.`
          : "Торговые операции импортированы.",
      );
    } catch {
      setJournalImportMessage("Не удалось выполнить импорт торговых операций.");
    }
  }

  async function importLocalViolations() {
    setJournalImportMessage("");
    try {
      const result = await importViolations(localImportViolations);
      setViolations(result.violations);
      setLocalImportViolations([]);
      setJournalImportMessage(
        result.skippedLinks
          ? `Нарушения импортированы. Записей с отсутствующими связями: ${result.skippedLinks}.`
          : "Нарушения импортированы.",
      );
    } catch {
      setJournalImportMessage("Не удалось выполнить импорт нарушений.");
    }
  }

  const searchProfiles = (state: EntitySearchState) => {
    const query = state.appliedQuery.trim().toLowerCase();

    if (!state.hasSearched || !query) {
      return [];
    }

    return activeProfiles
      .filter((profile) =>
        [
          getProfileTitle(profile),
          getProfileSecondaryTitle(profile),
          profile.fullName,
          profile.callsign,
          profile.registryNumber,
          getAffiliationLabel(profile.affiliation),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 6)
      .map((profile) => ({
        id: profile.id,
        title: getProfileTitle(profile),
        description: getProfileSecondaryTitle(profile) || profile.fullName || "Данные профиля не указаны",
        meta: getAffiliationLabel(profile.affiliation),
      }));
  };

  const searchGroups = (state: EntitySearchState) => {
    const query = state.appliedQuery.trim().toLowerCase();

    if (!state.hasSearched || !query) {
      return [];
    }

    return activeGroups
      .filter((group) => {
        const memberText = group.members
          .map((member) => {
            const profile = profileById.get(member.stalkerId);
            return profile ? `${profile.fullName} ${profile.callsign}` : "";
          })
          .join(" ");

        return `${group.name} ${memberText}`.toLowerCase().includes(query);
      })
      .slice(0, 6)
      .map((group) => ({
        id: group.id,
        title: group.name,
        description: `Участников: ${group.members.length}`,
        meta: group.status === "active" ? "Активна" : "Архив",
      }));
  };

  const taskStalkerSearchResults = searchProfiles(taskStalkerSearch);
  const taskGroupSearchResults = searchGroups(taskGroupSearch);
  const tradeStalkerSearchResults = searchProfiles(tradeStalkerSearch);
  const tradeGroupSearchResults = searchGroups(tradeGroupSearch);
  const violationProfileSearchResults = searchProfiles(violationProfileSearch);

  const visibleTasks = useMemo(() => {
    if (taskStatusFilter === "all") {
      return tasks;
    }

    return tasks.filter((task) => task.status === taskStatusFilter);
  }, [taskStatusFilter, tasks]);

  const saleOperations = useMemo(() => {
    return tradeOperations.filter((operation) => operation.type === "sale");
  }, [tradeOperations]);

  const purchaseOperations = useMemo(() => {
    return tradeOperations.filter((operation) => operation.type === "purchase");
  }, [tradeOperations]);

  const visibleViolations = useMemo(() => {
    if (violationStatusFilter === "all") {
      return violations;
    }

    return violations.filter((violation) => getViolationStatus(violation) === violationStatusFilter);
  }, [violationStatusFilter, violations]);

  const paginatedTasks = getPaginatedItems(visibleTasks, taskPage);
  const paginatedSaleOperations = getPaginatedItems(saleOperations, salePage);
  const paginatedPurchaseOperations = getPaginatedItems(purchaseOperations, purchasePage);
  const paginatedViolations = getPaginatedItems(visibleViolations, violationPage);
  const tradeDraftQuantity = Number(tradeDraft.quantity.replace(",", "."));
  const tradeDraftPrice = Number(tradeDraft.price.replace(",", "."));
  const tradeDraftTotal =
    Number.isFinite(tradeDraftQuantity) && Number.isFinite(tradeDraftPrice)
      ? tradeDraftQuantity * tradeDraftPrice
      : 0;
  const isEditingTask = Boolean(editingTaskId);
  const editingTask = tasks.find((task) => task.id === editingTaskId);
  const isEditingTrade = Boolean(editingTradeId);
  const isEditingViolation = Boolean(editingViolationId);
  const journalCounters: Record<JournalTab, number> = {
    Задания: visibleTasks.length,
    Продажи: saleOperations.length,
    Покупки: purchaseOperations.length,
    Нарушения: visibleViolations.length,
  };

  function updateTaskDraft<Field extends keyof typeof taskDraft>(
    field: Field,
    value: (typeof taskDraft)[Field],
  ) {
    const nextValue =
      typeof value === "string" && (field === "issuedAt" || field === "dueAt")
        ? (forceSystemYear(value) as (typeof taskDraft)[Field])
        : value;

    setTaskDraft((currentDraft) => ({ ...currentDraft, [field]: nextValue }));
    setTaskFormMessage("");
  }

  function applyEntitySearch(setSearch: Dispatch<SetStateAction<EntitySearchState>>) {
    setSearch((currentSearch) => ({
      ...currentSearch,
      appliedQuery: currentSearch.query,
      hasSearched: true,
    }));
  }

  function resetJournalSearches() {
    setTaskStalkerSearch(createEntitySearchState());
    setTaskGroupSearch(createEntitySearchState());
    setTradeStalkerSearch(createEntitySearchState());
    setTradeGroupSearch(createEntitySearchState());
    setViolationProfileSearch(createEntitySearchState());
  }

  function changeTaskAssigneeMode(mode: TaskAssigneeMode) {
    setTaskDraft((currentDraft) => ({
      ...currentDraft,
      assigneeMode: mode,
      stalkerId: "",
      groupId: "",
      manualAssigneeName: "",
    }));
    setTaskFormMessage("");
    setTaskStalkerSearch(createEntitySearchState());
    setTaskGroupSearch(createEntitySearchState());
  }

  function changeTradeParticipantMode(mode: TradeParticipantMode) {
    setTradeDraft((currentDraft) => ({
      ...currentDraft,
      participantMode: mode,
      stalkerId: "",
      groupId: "",
      manualParticipantName: "",
    }));
    setTradeFormMessage("");
    setTradeStalkerSearch(createEntitySearchState());
    setTradeGroupSearch(createEntitySearchState());
  }

  function changeViolationMode(mode: ViolationMode) {
    setViolationDraft((currentDraft) => ({
      ...currentDraft,
      violatorType: mode,
      profileId: "",
      manualViolatorName: "",
    }));
    setViolationFormMessage("");
    setViolationProfileSearch(createEntitySearchState());
  }

  function openTaskModal() {
    setTaskDraft(createEmptyTaskDraft());
    setEditingTaskId("");
    setTaskFormMessage("");
    resetJournalSearches();
    setIsTaskModalOpen(true);
  }

  function openEditTaskModal(task: Task) {
    setTaskDraft({
      assigneeMode: task.assigneeType,
      stalkerId: task.stalkerId ?? "",
      groupId: task.groupId ?? "",
      manualAssigneeName: task.manualAssigneeName ?? "",
      issuedAt: task.issuedAt,
      dueAt: task.dueAt,
      description: task.description,
      reward: task.reward,
      notes: task.notes,
      issuedBy: task.issuedBy,
      acceptedBy: task.acceptedBy ?? "",
    });
    setEditingTaskId(task.id);
    setTaskFormMessage("");
    resetJournalSearches();
    setIsTaskModalOpen(true);
  }

  function closeTaskModal() {
    setIsTaskModalOpen(false);
    setEditingTaskId("");
    setTaskDraft(createEmptyTaskDraft());
    setTaskFormMessage("");
    resetJournalSearches();
  }

  function openCompleteTaskModal(taskId: string) {
    setCompletingTaskId(taskId);
    setCompleteTaskAcceptedBy("");
    setCompleteTaskMessage("");
  }

  function closeCompleteTaskModal() {
    setCompletingTaskId("");
    setCompleteTaskAcceptedBy("");
    setCompleteTaskMessage("");
  }

  function openTradeModal(type: TradeType) {
    setTradeDraft(createEmptyTradeDraft(type));
    setEditingTradeId("");
    setTradeFormMessage("");
    resetJournalSearches();
    setTradeModalType(type);
  }

  function openEditTradeModal(operation: TradeOperation) {
    const firstItem = operation.items[0];

    setTradeDraft({
      type: operation.type,
      participantMode: operation.subjectType,
      stalkerId: operation.stalkerId ?? "",
      groupId: operation.groupId ?? "",
      manualParticipantName: operation.manualParticipantName ?? "",
      itemName: firstItem?.name ?? "",
      quantity: firstItem ? String(firstItem.quantity) : "1",
      price: firstItem ? String(firstItem.price) : "",
      issuedBy: operation.issuedBy,
      notes: operation.notes,
      operationDate: (operation.operationDate ?? operation.createdAt).slice(0, 10),
    });
    setEditingTradeId(operation.id);
    setTradeFormMessage("");
    resetJournalSearches();
    setTradeModalType(operation.type);
  }

  function closeTradeModal() {
    setTradeModalType(null);
    setEditingTradeId("");
    setTradeDraft(createEmptyTradeDraft("sale"));
    setTradeFormMessage("");
    resetJournalSearches();
  }

  function updateTradeDraft<Field extends keyof typeof tradeDraft>(
    field: Field,
    value: (typeof tradeDraft)[Field],
  ) {
    const nextValue =
      typeof value === "string" && field === "operationDate"
        ? (forceSystemYear(value) as (typeof tradeDraft)[Field])
        : value;

    setTradeDraft((currentDraft) => ({ ...currentDraft, [field]: nextValue }));
    setTradeFormMessage("");
  }

  function updateViolationDraft<Field extends keyof typeof violationDraft>(
    field: Field,
    value: (typeof violationDraft)[Field],
  ) {
    const nextValue =
      typeof value === "string" && field === "date"
        ? (forceSystemYear(value) as (typeof violationDraft)[Field])
        : value;

    setViolationDraft((currentDraft) => ({ ...currentDraft, [field]: nextValue }));
    setViolationFormMessage("");
  }

  function closeViolationModal() {
    setIsViolationModalOpen(false);
    setEditingViolationId("");
    setViolationDraft(createEmptyViolationDraft());
    setViolationFormMessage("");
    resetJournalSearches();
  }

  function openCloseViolationModal(violation: Violation) {
    setClosingViolationId(violation.id);
    setViolationClosureNote("");
    setViolationClosureMessage("");
  }

  function closeCloseViolationModal() {
    setClosingViolationId("");
    setViolationClosureNote("");
    setViolationClosureMessage("");
  }

  function openViolationModal() {
    setViolationDraft(createEmptyViolationDraft());
    setEditingViolationId("");
    setViolationFormMessage("");
    resetJournalSearches();
    setIsViolationModalOpen(true);
  }

  function openEditViolationModal(violation: Violation) {
    setViolationDraft({
      violatorType: violation.violatorType,
      profileId: violation.profileId ?? "",
      manualViolatorName: violation.manualViolatorName ?? "",
      date: violation.date.slice(0, 10),
      description: violation.description,
      issuedBy: violation.issuedBy,
      notes: violation.notes,
    });
    setEditingViolationId(violation.id);
    setViolationFormMessage("");
    resetJournalSearches();
    setIsViolationModalOpen(true);
  }

  function getTradeParticipantLabel(operation: TradeOperation) {
    if (operation.subjectType === "stalker") {
      const profile = operation.stalkerId ? profileById.get(operation.stalkerId) : null;
      return profile ? getProfileTitle(profile) : "Профиль не найден";
    }

    if (operation.subjectType === "group") {
      const group = operation.groupId ? groupById.get(operation.groupId) : null;
      return group ? group.name : "Группа не найдена";
    }

    return operation.manualParticipantName || "Участник указан вручную";
  }

  function getViolationSubjectLabel(violation: Violation) {
    if (violation.violatorType === "profile") {
      const profile = violation.profileId ? profileById.get(violation.profileId) : null;
      return profile ? getProfileTitle(profile) : "Профиль не найден";
    }

    return violation.manualViolatorName || "Нарушитель указан вручную";
  }

  function getSelectedProfileLabel(profileId: string) {
    const profile = profileId ? profileById.get(profileId) : null;
    return profile ? getProfileTitle(profile) : "";
  }

  function getSelectedGroupLabel(groupId: string) {
    const group = groupId ? groupById.get(groupId) : null;
    return group ? group.name : "";
  }

  async function handleTradeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const itemName = tradeDraft.itemName.trim();
    const quantity = Number(tradeDraft.quantity.replace(",", "."));
    const price = Number(tradeDraft.price.replace(",", "."));

    if (!itemName) {
      setTradeFormMessage("Укажите предмет операции.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setTradeFormMessage("Укажите корректное количество.");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setTradeFormMessage("Укажите корректную цену за единицу.");
      return;
    }

    const item = {
      id: `trade-item-${Date.now()}`,
      name: itemName,
      quantity,
      price,
      notes: "",
    };

    if (editingTradeId) {
      const currentOperation = tradeOperations.find((operation) => operation.id === editingTradeId);
      const updatedOperation = await updateTradeOperation(editingTradeId, {
        items: [
          {
            ...item,
            id: currentOperation?.items[0]?.id ?? item.id,
          },
        ],
        totalAmount: quantity * price,
        issuedBy: tradeDraft.issuedBy.trim(),
        notes: tradeDraft.notes.trim(),
        operationDate: tradeDraft.operationDate,
      }).catch(() => {
        setTradeFormMessage("Не удалось сохранить торговую операцию.");
        return null;
      });

      if (!updatedOperation) {
        return;
      }

      setTradeOperations((currentOperations) =>
        currentOperations.map((operation) => (operation.id === editingTradeId ? updatedOperation : operation)),
      );

      if (tradeModalType === "sale") {
        setSaleTableMessage("Продажа обновлена.");
      } else {
        setPurchaseTableMessage("Покупка обновлена.");
      }

      addActivityLogEntry({
        type: "trade",
        title:
          tradeDraft.type === "sale"
            ? `Продажа изменена: ${itemName}`
            : `Покупка изменена: ${itemName}`,
        status: "OK",
      });
      closeTradeModal();
      return;
    }

    let stalkerId: string | null = null;
    let groupId: string | null = null;
    let manualParticipantName: string | undefined;

    if (tradeDraft.participantMode === "stalker") {
      if (!tradeDraft.stalkerId) {
        setTradeFormMessage(tradeDraft.type === "sale" ? "Выберите покупателя." : "Выберите продавца.");
        return;
      }

      stalkerId = tradeDraft.stalkerId;
    }

    if (tradeDraft.participantMode === "group") {
      if (!tradeDraft.groupId) {
        setTradeFormMessage(tradeDraft.type === "sale" ? "Выберите группу-покупателя." : "Выберите группу-продавца.");
        return;
      }

      groupId = tradeDraft.groupId;
    }

    if (tradeDraft.participantMode === "manual") {
      const manualName = tradeDraft.manualParticipantName.trim();

      if (!manualName) {
        setTradeFormMessage(tradeDraft.type === "sale" ? "Укажите покупателя вручную." : "Укажите продавца вручную.");
        return;
      }

      manualParticipantName = manualName;
    }

    const newOperation = await createTradeOperation({
      type: tradeDraft.type,
      subjectType: tradeDraft.participantMode,
      stalkerId,
      groupId,
      manualParticipantName,
      items: [item],
      totalAmount: quantity * price,
      issuedBy: tradeDraft.issuedBy.trim(),
      notes: tradeDraft.notes.trim(),
      operationDate: tradeDraft.operationDate,
    }).catch(() => {
      setTradeFormMessage("Не удалось сохранить торговую операцию.");
      return null;
    });

    if (!newOperation) {
      return;
    }

    setTradeOperations((currentOperations) => [newOperation, ...currentOperations]);

    if (tradeDraft.type === "sale") {
      setSalePage(1);
      setSaleTableMessage("Продажа оформлена и сохранена в базе данных.");
    } else {
      setPurchasePage(1);
      setPurchaseTableMessage("Покупка оформлена и сохранена в базе данных.");
    }

    addActivityLogEntry({
      type: "trade",
      title:
        tradeDraft.type === "sale"
          ? `Оформлена продажа: ${itemName} — ${getTradeParticipantLabel(newOperation)}`
          : `Оформлена покупка: ${itemName} — ${getTradeParticipantLabel(newOperation)}`,
      status: "OK",
    });
    closeTradeModal();
  }

  function deleteTradeOperation(operationId: string, type: TradeType) {
    const operation = tradeOperations.find((currentOperation) => currentOperation.id === operationId);
    setConfirmDialog({
      title: type === "sale" ? "Удалить продажу" : "Удалить покупку",
      message:
        operation?.items[0]?.name ||
        (type === "sale"
          ? "Запись о продаже будет удалена из журнала без возможности восстановления."
          : "Запись о покупке будет удалена из журнала без возможности восстановления."),
      confirmLabel: "Удалить",
      confirmTone: "danger",
      onConfirm: async () => {
        await deleteTradeOperationRecord(operationId);
        setTradeOperations((currentOperations) =>
          currentOperations.filter((currentOperation) => currentOperation.id !== operationId),
        );
        if (type === "sale") {
          setSaleTableMessage("Запись о продаже удалена.");
        } else {
          setPurchaseTableMessage("Запись о покупке удалена.");
        }
        addActivityLogEntry({
          type: "trade",
          title:
            type === "sale"
              ? `Продажа удалена: ${operation?.items[0]?.name ?? "Предмет не указан"}`
              : `Покупка удалена: ${operation?.items[0]?.name ?? "Предмет не указан"}`,
          status: "WARN",
        });
      },
    });
  }
  async function handleViolationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const description = violationDraft.description.trim();

    if (!description) {
      setViolationFormMessage("Опишите нарушение.");
      return;
    }

    if (editingViolationId) {
      const updatedViolation = await updateViolation(editingViolationId, {
        date: violationDraft.date,
        description,
        issuedBy: violationDraft.issuedBy.trim(),
        notes: violationDraft.notes.trim(),
      }).catch(() => {
        setViolationFormMessage("Не удалось сохранить нарушение.");
        return null;
      });

      if (!updatedViolation) {
        return;
      }

      setViolations((currentViolations) =>
        currentViolations.map((violation) => (violation.id === editingViolationId ? updatedViolation : violation)),
      );
      setViolationTableMessage("Нарушение обновлено.");
      addActivityLogEntry({
        type: "stalker",
        title: `Нарушение изменено: ${description}`,
        status: "OK",
      });
      closeViolationModal();
      return;
    }

    let profileId: string | undefined;
    let manualViolatorName: string | undefined;

    if (violationDraft.violatorType === "profile") {
      if (!violationDraft.profileId) {
        setViolationFormMessage("Выберите профиль нарушителя.");
        return;
      }

      profileId = violationDraft.profileId;
    }

    if (violationDraft.violatorType === "manual") {
      const manualName = violationDraft.manualViolatorName.trim();

      if (!manualName) {
        setViolationFormMessage("Укажите нарушителя вручную.");
        return;
      }

      manualViolatorName = manualName;
    }

    const newViolation = await createViolation({
      violatorType: violationDraft.violatorType,
      profileId,
      manualViolatorName,
      status: "active",
      date: violationDraft.date,
      description,
      issuedBy: violationDraft.issuedBy.trim(),
      notes: violationDraft.notes.trim(),
    }).catch(() => {
      setViolationFormMessage("Не удалось сохранить нарушение.");
      return null;
    });

    if (!newViolation) {
      return;
    }

    setViolations((currentViolations) => [newViolation, ...currentViolations]);
    setViolationPage(1);
    setViolationTableMessage("Нарушение оформлено и сохранено в базе данных.");
    addActivityLogEntry({
      type: "stalker",
      title: `Оформлено нарушение: ${description}`,
      status: "WARN",
      description: getViolationSubjectLabel(newViolation),
    });
    closeViolationModal();
  }

  function deleteViolation(violationId: string) {
    const violation = violations.find((currentViolation) => currentViolation.id === violationId);
    setConfirmDialog({
      title: "Удалить нарушение",
      message: violation?.description || "Запись о нарушении будет удалена из журнала без возможности восстановления.",
      confirmLabel: "Удалить",
      confirmTone: "danger",
      onConfirm: async () => {
        await deleteViolationRecord(violationId);
        setViolations((currentViolations) =>
          currentViolations.filter((currentViolation) => currentViolation.id !== violationId),
        );
        setViolationTableMessage("Запись о нарушении удалена.");
        addActivityLogEntry({
          type: "stalker",
          title: `Нарушение удалено: ${violation?.description ?? "Без описания"}`,
          status: "WARN",
        });
      },
    });
  }
  async function closeViolationRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const closureNote = violationClosureNote.trim();

    if (!closureNote) {
      setViolationClosureMessage("Опишите, что сталкер сделал для закрытия нарушения.");
      return;
    }

    const updatedViolation = await updateViolation(closingViolationId, {
      status: "closed",
      closedAt: getSystemTimestamp(),
      closureNote,
    }).catch(() => {
      setViolationClosureMessage("Не удалось погасить нарушение.");
      return null;
    });

    if (!updatedViolation) {
      return;
    }

    setViolations((currentViolations) =>
      currentViolations.map((violation) => (violation.id === closingViolationId ? updatedViolation : violation)),
    );
    setViolationTableMessage("Нарушение погашено.");
    const violation = violations.find((currentViolation) => currentViolation.id === closingViolationId);
    addActivityLogEntry({
      type: "stalker",
      title: `Нарушение закрыто: ${violation?.description ?? "Без описания"}`,
      status: "OK",
    });
    closeCloseViolationModal();
  }

  function getTaskAssigneeLabel(task: Task) {
    if (task.assigneeType === "stalker") {
      const profile = task.stalkerId ? profileById.get(task.stalkerId) : null;
      return profile ? getProfileTitle(profile) : "Профиль не найден";
    }

    if (task.assigneeType === "group") {
      const group = task.groupId ? groupById.get(task.groupId) : null;
      return group ? group.name : "Группа не найдена";
    }

    return task.manualAssigneeName || "Исполнитель указан вручную";
  }

  function getTaskActivityTitle(task: Task, action: "created" | "completed" | "cancelled") {
    const assigneeLabel = getTaskAssigneeLabel(task);
    const taskDescription = task.description || "Без описания";

    if (task.assigneeType === "group") {
      if (action === "created") {
        return `Выдано групповое задание: ${assigneeLabel} — ${taskDescription}`;
      }

      if (action === "completed") {
        return `Групповое задание выполнено: ${assigneeLabel} — ${taskDescription}`;
      }

      return `Групповое задание отменено: ${assigneeLabel} — ${taskDescription}`;
    }

    if (action === "created") {
      return `Выдано задание: ${taskDescription}`;
    }

    if (action === "completed") {
      return `Задание выполнено: ${taskDescription}`;
    }

    return `Задание отменено: ${taskDescription}`;
  }

  function getSelectedGroupHasDutyMember(groupId: string) {
    const group = groupById.get(groupId);

    if (!group) {
      return false;
    }

    return group.members.some((member) => {
      const profile = profileById.get(member.stalkerId);
      return profile?.affiliation === "duty";
    });
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const description = taskDraft.description.trim();

    if (!description) {
      setTaskFormMessage("Опишите задание.");
      return;
    }

    if (editingTaskId) {
      const acceptedBy = taskDraft.acceptedBy.trim();
      const currentTask = tasks.find((task) => task.id === editingTaskId);
      const updatedTask = await updateTask(editingTaskId, {
        issuedAt: taskDraft.issuedAt,
        dueAt: taskDraft.dueAt,
        description,
        reward: taskDraft.reward.trim(),
        notes: taskDraft.notes.trim(),
        issuedBy: taskDraft.issuedBy.trim(),
        acceptedBy: currentTask?.status === "completed" ? currentTask.acceptedBy : acceptedBy || null,
      }).catch(() => {
        setTaskFormMessage("Не удалось сохранить задание.");
        return null;
      });

      if (!updatedTask) {
        return;
      }

      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === editingTaskId ? updatedTask : task)),
      );
      setTaskTableMessage("Задание обновлено.");
      addActivityLogEntry({
        type: "task",
        title: `Задание изменено: ${description}`,
        status: "OK",
      });
      closeTaskModal();
      return;
    }

    let assigneeType: TaskAssigneeType = taskDraft.assigneeMode;
    let stalkerId: string | null = null;
    let groupId: string | null = null;
    let manualAssigneeName: string | undefined;

    if (taskDraft.assigneeMode === "stalker") {
      if (!taskDraft.stalkerId) {
        setTaskFormMessage("Выберите сталкерский профиль.");
        return;
      }

      const selectedProfile = profileById.get(taskDraft.stalkerId);

      if (!selectedProfile) {
        setTaskFormMessage("Выбранный профиль не найден.");
        return;
      }

      if (selectedProfile.affiliation === "duty") {
        setTaskFormMessage("Задания членам «Долга» не выдаются.");
        return;
      }

      stalkerId = selectedProfile.id;
    }

    if (taskDraft.assigneeMode === "group") {
      if (!taskDraft.groupId) {
        setTaskFormMessage("Выберите группу сталкеров.");
        return;
      }

      if (getSelectedGroupHasDutyMember(taskDraft.groupId)) {
        setTaskFormMessage("Задание нельзя выдать группе, в составе которой есть член «Долга».");
        return;
      }

      groupId = taskDraft.groupId;
    }

    if (taskDraft.assigneeMode === "manual") {
      const manualName = taskDraft.manualAssigneeName.trim();

      if (!manualName) {
        setTaskFormMessage("Укажите исполнителя вручную.");
        return;
      }

      assigneeType = "manual";
      manualAssigneeName = manualName;
    }

    const newTask = await createTask({
      assigneeType,
      stalkerId,
      groupId,
      manualAssigneeName,
      issuedAt: taskDraft.issuedAt,
      dueAt: taskDraft.dueAt,
      description,
      reward: taskDraft.reward.trim(),
      notes: taskDraft.notes.trim(),
      issuedBy: taskDraft.issuedBy.trim(),
      acceptedBy: null,
      completedAt: null,
      status: "active",
    }).catch(() => {
      setTaskFormMessage("Не удалось создать задание.");
      return null;
    });

    if (!newTask) {
      return;
    }

    setTasks((currentTasks) => [newTask, ...currentTasks]);
    setTaskStatusFilter("active");
    setTaskPage(1);
    setTaskTableMessage("Задание создано и сохранено в базе данных.");
    addActivityLogEntry({
      type: "task",
      title: getTaskActivityTitle(newTask, "created"),
      status: "OK",
      description: getTaskAssigneeLabel(newTask),
    });
    closeTaskModal();
  }

  async function handleCompleteTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const task = tasks.find((currentTask) => currentTask.id === completingTaskId);
    const normalizedAcceptedBy = completeTaskAcceptedBy.trim();
    if (!normalizedAcceptedBy) {
      setCompleteTaskMessage("Укажите, кто принял выполнение задания.");
      return;
    }
    const updatedTask = await updateTask(completingTaskId, {
      acceptedBy: normalizedAcceptedBy,
      completedAt: getSystemTimestamp(),
      status: "completed",
    }).catch(() => {
      setCompleteTaskMessage("Не удалось завершить задание.");
      return null;
    });

    if (!updatedTask) {
      return;
    }

    setTasks((currentTasks) => currentTasks.map((currentTask) => (currentTask.id === completingTaskId ? updatedTask : currentTask)));
    setTaskTableMessage("Задание завершено.");
    addActivityLogEntry({
      type: "task",
      title: task ? getTaskActivityTitle(task, "completed") : "Задание выполнено: Без описания",
      status: "OK",
    });
    closeCompleteTaskModal();
  }
  async function cancelTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    const updatedTask = await updateTask(taskId, { status: "cancelled" }).catch(() => {
      setTaskTableMessage("Не удалось отменить задание.");
      return null;
    });

    if (!updatedTask) {
      return;
    }

    setTasks((currentTasks) => currentTasks.map((task) => (task.id === taskId ? updatedTask : task)));
    setTaskTableMessage("Задание отменено.");
    addActivityLogEntry({
      type: "task",
      title: task ? getTaskActivityTitle(task, "cancelled") : "Задание отменено: Без описания",
      status: "WARN",
    });
  }

  function deleteTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    setConfirmDialog({
      title: "Удалить задание",
      message: task?.description || "Запись будет удалена из журнала без возможности восстановления.",
      confirmLabel: "Удалить",
      confirmTone: "danger",
      onConfirm: async () => {
        await deleteTaskRecord(taskId);
        setTasks((currentTasks) => currentTasks.filter((currentTask) => currentTask.id !== taskId));
        setTaskTableMessage("Задание удалено.");
        addActivityLogEntry({
          type: "task",
          title: `Задание удалено: ${task?.description ?? "Без описания"}`,
          status: "WARN",
        });
      },
    });
  }
  function changeJournalTab(tab: string) {
    if (!journalTabs.includes(tab as JournalTab)) {
      return;
    }

    setActiveJournalTab(tab as JournalTab);
  }

  function renderTasksJournal() {
    return (
      <section className="task-section journal-workspace">
        <div className="section-header work-block-header journal-toolbar">
          <div className="journal-title-block">
            <h1>Журнал заданий</h1>
            <p>Общий список заданий сталкеров, групп и вручную указанных исполнителей</p>
          </div>
          <button className="primary-command" onClick={openTaskModal} type="button">
            Создать задание
          </button>
        </div>

        <div className="list-tabs segmented-tabs journal-filter-bar" role="tablist" aria-label="Фильтр заданий">
          {taskStatusFilters.map((filter) => (
            <button
              className={taskStatusFilter === filter.value ? "list-tab list-tab-active" : "list-tab"}
              key={filter.value}
              onClick={() => {
                setTaskStatusFilter(filter.value);
                setTaskPage(1);
              }}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        {taskTableMessage ? <p className="table-message">{taskTableMessage}</p> : null}

        {!isStorageReady ? (
          <div className="empty-state">
            <p>Загрузка записей...</p>
          </div>
        ) : (
          <>
            <div className="task-list">
              {paginatedTasks.items.length > 0 ? (
                paginatedTasks.items.map((task) => (
                  <TaskRecordCard
                    actions={
                      <>
                        {task.status === "active" ? (
                          <button className="command-row task-action-button" onClick={() => openEditTaskModal(task)} type="button">
                          Редактировать
                          </button>
                        ) : null}
                        {task.status === "active" ? (
                          <button className="command-row task-action-button" onClick={() => openCompleteTaskModal(task.id)} type="button">
                            Зачесть
                          </button>
                        ) : null}
                        {task.status === "active" ? (
                          <button className="command-row task-action-button" onClick={() => cancelTask(task.id)} type="button">
                            Отменить
                          </button>
                        ) : null}
                        <button className="command-row task-action-button" onClick={() => deleteTask(task.id)} type="button">
                          Удалить
                        </button>
                      </>
                    }
                    assigneeLabel={getTaskAssigneeLabel(task)}
                    formatDate={formatDate}
                    key={task.id}
                    statusClassName={getTaskStatusClass(task.status)}
                    statusLabel={taskStatusLabels[task.status]}
                    task={task}
                  />
                ))
              ) : (
                <div className="empty-state journal-empty">
                  <p>Заданий по выбранному фильтру нет.</p>
                  <span>Создайте задание или переключите фильтр статуса.</span>
                  <button className="primary-command" onClick={openTaskModal} type="button">
                    Создать задание
                  </button>
                </div>
              )}
            </div>

            <Pagination
              page={paginatedTasks.page}
              pageCount={paginatedTasks.pageCount}
              onPageChange={setTaskPage}
            />
          </>
        )}
      </section>
    );
  }

  function renderTradeJournal(type: TradeType) {
    const isSale = type === "sale";
    const operations = isSale ? paginatedSaleOperations : paginatedPurchaseOperations;
    const tableMessage = isSale ? saleTableMessage : purchaseTableMessage;
    const title = isSale ? "Журнал продаж" : "Журнал покупок";
    const description = isSale
      ? "Операции, где «Долг» продаёт предметы сталкерам, группам или вручную указанным покупателям"
      : "Операции, где «Долг» покупает предметы у сталкеров, групп или вручную указанных продавцов";

    return (
      <section className="task-section journal-workspace">
        <div className="section-header work-block-header journal-toolbar">
          <div className="journal-title-block">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <button className="primary-command" onClick={() => openTradeModal(type)} type="button">
            {isSale ? "Оформить продажу" : "Оформить покупку"}
          </button>
        </div>

        {tableMessage ? <p className="table-message">{tableMessage}</p> : null}

        {!isStorageReady ? (
          <div className="empty-state">
            <p>Загрузка записей...</p>
          </div>
        ) : (
          <>
            <div className="task-list">
              {operations.items.length > 0 ? (
                operations.items.map((operation) => (
                  <TradeRecordCard
                    actions={
                      <>
                        <button className="command-row task-action-button" onClick={() => openEditTradeModal(operation)} type="button">
                          Редактировать
                        </button>
                        <button className="command-row task-action-button" onClick={() => deleteTradeOperation(operation.id, operation.type)} type="button">
                          Удалить
                        </button>
                      </>
                    }
                    formatDate={formatDate}
                    formatMoney={formatMoney}
                    key={operation.id}
                    operation={operation}
                    participantLabel={getTradeParticipantLabel(operation)}
                    participantRoleLabel={isSale ? "Покупатель" : "Продавец"}
                    typeLabel={tradeTypeLabels[operation.type]}
                  />
                ))
              ) : (
                <div className="empty-state journal-empty">
                  <p>{isSale ? "Продаж пока нет." : "Покупок пока нет."}</p>
                  <span>{isSale ? "Оформите первую продажу из этого журнала." : "Оформите первую покупку из этого журнала."}</span>
                  <button className="primary-command" onClick={() => openTradeModal(type)} type="button">
                    {isSale ? "Оформить продажу" : "Оформить покупку"}
                  </button>
                </div>
              )}
            </div>

            <Pagination
              page={operations.page}
              pageCount={operations.pageCount}
              onPageChange={isSale ? setSalePage : setPurchasePage}
            />
          </>
        )}
      </section>
    );
  }

  function renderViolationsJournal() {
    return (
      <section className="task-section journal-workspace">
        <div className="section-header work-block-header journal-toolbar">
          <div className="journal-title-block">
            <h1>Журнал нарушений</h1>
            <p>Записи о нарушениях сталкеров и вручную указанных нарушителей</p>
          </div>
          <button className="primary-command" onClick={openViolationModal} type="button">
            Оформить нарушение
          </button>
        </div>

        {violationTableMessage ? <p className="table-message">{violationTableMessage}</p> : null}

        {!isStorageReady ? (
          <div className="empty-state">
            <p>Загрузка записей...</p>
          </div>
        ) : (
          <>
            <div className="list-tabs segmented-tabs journal-filter-bar" role="tablist" aria-label="Фильтры журнала нарушений">
              {violationStatusFilters.map((filter) => (
                <button
                  className={violationStatusFilter === filter.value ? "list-tab list-tab-active" : "list-tab"}
                  key={filter.value}
                  onClick={() => {
                    setViolationStatusFilter(filter.value);
                    setViolationPage(1);
                  }}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="task-list">
              {paginatedViolations.items.length > 0 ? (
                paginatedViolations.items.map((violation) => (
                  <ViolationRecordCard
                    actions={
                      <>
                        <button className="command-row task-action-button" onClick={() => openEditViolationModal(violation)} type="button">
                          Редактировать
                        </button>
                        {isViolationActive(violation) ? (
                          <button className="command-row task-action-button" onClick={() => openCloseViolationModal(violation)} type="button">
                            Закрыть нарушение
                          </button>
                        ) : null}
                        <button className="command-row task-action-button" onClick={() => deleteViolation(violation.id)} type="button">
                          Удалить
                        </button>
                      </>
                    }
                    formatDate={formatDate}
                    isActive={isViolationActive(violation)}
                    key={violation.id}
                    statusClassName={getViolationStatusClass(violation)}
                    statusLabel={getViolationStatusLabel(violation)}
                    violation={violation}
                    violatorLabel={getViolationSubjectLabel(violation)}
                    violatorTypeLabel={violation.violatorType === "profile" ? "Профиль" : "Ручной ввод"}
                  />
                ))
              ) : (
                <div className="empty-state journal-empty">
                  <p>Нарушений пока нет.</p>
                  <span>Оформите нарушение или переключите фильтр статуса.</span>
                  <button className="primary-command" onClick={openViolationModal} type="button">
                    Оформить нарушение
                  </button>
                </div>
              )}
            </div>

            <Pagination
              page={paginatedViolations.page}
              pageCount={paginatedViolations.pageCount}
              onPageChange={setViolationPage}
            />
          </>
        )}
      </section>
    );
  }
  function renderActiveJournal() {
    if (activeJournalTab === "Задания") {
      return renderTasksJournal();
    }

    if (activeJournalTab === "Продажи") {
      return renderTradeJournal("sale");
    }

    if (activeJournalTab === "Покупки") {
      return renderTradeJournal("purchase");
    }

    return renderViolationsJournal();
  }

  return (
    <main className="pda-page journals-page">
      <section className="pda-screen">
        <PdaTopbar
          activeLabel="Журналы"
          activeSubtabLabel={activeJournalTab}
          onSubtabChange={changeJournalTab}
        />

        <div className="pda-content journals-content">
          <section className="section-panel journals-panel">
            <div className="journals-shell">
              <div className="journal-overview">
                <div className="journal-overview-copy">
                  <h1>Журналы</h1>
                  <p>{journalDescriptions[activeJournalTab]}</p>
                </div>
                <div className="journal-stats">
                  <div className="journal-stat">
                    <span>Активных заданий</span>
                    <strong>{tasks.filter((task) => task.status === "active").length}</strong>
                  </div>
                  <div className="journal-stat">
                    <span>Торговых операций</span>
                    <strong>{tradeOperations.length}</strong>
                  </div>
                  <div className="journal-stat">
                    <span>Активных нарушений</span>
                    <strong>{violations.filter((violation) => isViolationActive(violation)).length}</strong>
                  </div>
                </div>
              </div>

              <div className="journal-tabs-grid" role="tablist" aria-label="Разделы журналов">
                {journalTabs.map((tab) => (
                  <button
                    className={activeJournalTab === tab ? "journal-tab-card journal-tab-card-active" : "journal-tab-card"}
                    key={tab}
                    onClick={() => changeJournalTab(tab)}
                    type="button"
                  >
                    <span>{tab}</span>
                    <strong>{journalCounters[tab]}</strong>
                  </button>
                ))}
              </div>

              {isJournalLoading ? <p className="draft-message">Загрузка журналов...</p> : null}
              {journalLoadMessage ? <p className="form-error">{journalLoadMessage}</p> : null}
              {journalImportMessage ? <p className="draft-message">{journalImportMessage}</p> : null}
              {localImportTasks.length > 0 || localImportTradeOperations.length > 0 || localImportViolations.length > 0 ? (
                <div className="apartment-import-panel">
                  {localImportTasks.length > 0 ? (
                    <button className="command-row" onClick={importLocalTasks} type="button">
                      Найдены записи заданий для импорта. Импортировать записи
                    </button>
                  ) : null}
                  {localImportTradeOperations.length > 0 ? (
                    <button className="command-row" onClick={importLocalTradeOperations} type="button">
                      Найдены торговые операции для импорта. Импортировать записи
                    </button>
                  ) : null}
                  {localImportViolations.length > 0 ? (
                    <button className="command-row" onClick={importLocalViolations} type="button">
                      Найдены нарушения для импорта. Импортировать записи
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="profile-detail journals-detail">{renderActiveJournal()}</div>
            </div>
          </section>
        </div>
      </section>

      {completingTaskId ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal task-complete-modal journal-action-modal" onSubmit={handleCompleteTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Зачёт задания</h1>
                <p>{tasks.find((task) => task.id === completingTaskId)?.description ?? "Задание"}</p>
              </div>
            </div>
            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Подтверждение</h2>
                  <span>Укажите, кто принял выполнение</span>
                </div>
                <div className="task-complete-grid">
                  <label className="filter-field">
                    <span>Кто засчитал</span>
                    <input
                      onChange={(event) => {
                        setCompleteTaskAcceptedBy(event.target.value);
                        setCompleteTaskMessage("");
                      }}
                      placeholder="Позывной или должность члена Долга"
                      type="text"
                      value={completeTaskAcceptedBy}
                    />
                  </label>
                </div>
              </section>
            </div>
            <div className="modal-message-slot">
              {completeTaskMessage ? <p className="draft-message">{completeTaskMessage}</p> : null}
            </div>
            <div className="modal-actions">
              <button className="command-row" onClick={closeCompleteTaskModal} type="button">
                Отмена
              </button>
              <button className="primary-command journal-modal-submit journal-modal-submit-confirm" type="submit">
                Зачесть
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {isTaskModalOpen ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal journal-modal" onSubmit={handleTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{isEditingTask ? "Редактирование задания" : "Создание задания"}</h1>
                <p>
                  {isEditingTask
                    ? "Исполнитель и статус задания сохраняются без изменений"
                    : "Запись будет добавлена в общий журнал заданий и сохранена в базе данных"}
                </p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Исполнитель</h2>
                  <span>Профиль, группа или ручной ввод</span>
                </div>

                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Способ указания исполнителя</span>
                    <select
                      disabled={isEditingTask}
                      onChange={(event) => changeTaskAssigneeMode(event.target.value as TaskAssigneeMode)}
                      value={taskDraft.assigneeMode}
                    >
                      <option value="stalker">Выбрать профиль сталкера</option>
                      <option value="group">Выбрать группу сталкеров</option>
                      <option value="manual">Ручной ввод исполнителя</option>
                    </select>
                  </label>

                  {taskDraft.assigneeMode === "stalker" ? (
                    <SearchableEntityPicker
                      appliedQuery={taskStalkerSearch.appliedQuery}
                      disabled={isEditingTask}
                      hasSearched={taskStalkerSearch.hasSearched}
                      onApply={() => applyEntitySearch(setTaskStalkerSearch)}
                      onQueryChange={(value) => setTaskStalkerSearch((currentSearch) => ({ ...currentSearch, query: value }))}
                      onReset={() => updateTaskDraft("stalkerId", "")}
                      onSelect={(id) => updateTaskDraft("stalkerId", id)}
                      placeholder="Позывной, ФИО или номер профиля"
                      query={taskStalkerSearch.query}
                      results={taskStalkerSearchResults}
                      selectedLabel={getSelectedProfileLabel(taskDraft.stalkerId)}
                      selectedPrefix="Выбран сталкер"
                      title="Поиск сталкерского профиля"
                    />
                  ) : null}

                  {taskDraft.assigneeMode === "group" ? (
                    <SearchableEntityPicker
                      appliedQuery={taskGroupSearch.appliedQuery}
                      disabled={isEditingTask}
                      hasSearched={taskGroupSearch.hasSearched}
                      onApply={() => applyEntitySearch(setTaskGroupSearch)}
                      onQueryChange={(value) => setTaskGroupSearch((currentSearch) => ({ ...currentSearch, query: value }))}
                      onReset={() => updateTaskDraft("groupId", "")}
                      onSelect={(id) => updateTaskDraft("groupId", id)}
                      placeholder="Название группы или участник"
                      query={taskGroupSearch.query}
                      results={taskGroupSearchResults}
                      selectedLabel={getSelectedGroupLabel(taskDraft.groupId)}
                      selectedPrefix="Выбрана группа"
                      title="Поиск группы сталкеров"
                    />
                  ) : null}

                  {taskDraft.assigneeMode === "manual" ? (
                    <label className="filter-field">
                      <span>Исполнитель</span>
                      <input
                        disabled={isEditingTask}
                        onChange={(event) => updateTaskDraft("manualAssigneeName", event.target.value)}
                        placeholder="Имя или позывной"
                        type="text"
                        value={taskDraft.manualAssigneeName}
                      />
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Параметры задания</h2>
                  <span>Сроки, награда и ответственный</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Дата выдачи</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateTaskDraft("issuedAt", event.target.value)} type="date" value={taskDraft.issuedAt} />
                  </label>
                  <label className="filter-field">
                    <span>Выполнить до</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateTaskDraft("dueAt", event.target.value)} type="date" value={taskDraft.dueAt} />
                  </label>
                  <label className="filter-field">
                    <span>Награда</span>
                    <input onChange={(event) => updateTaskDraft("reward", event.target.value)} placeholder="Например: 5000 рублей" type="text" value={taskDraft.reward} />
                  </label>
                  <label className="filter-field">
                    <span>Кто выдал</span>
                    <input onChange={(event) => updateTaskDraft("issuedBy", event.target.value)} placeholder="Позывной или должность" type="text" value={taskDraft.issuedBy} />
                  </label>
                  {isEditingTask && editingTask?.status !== "completed" ? (
                    <label className="filter-field">
                      <span>Кто принял выполнение</span>
                      <input
                        onChange={(event) => updateTaskDraft("acceptedBy", event.target.value)}
                        placeholder="Позывной или должность"
                        type="text"
                        value={taskDraft.acceptedBy}
                      />
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Описание</h2>
                  <span>Задача и дополнительные условия</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field task-form-wide">
                    <span>Описание задания</span>
                    <textarea onChange={(event) => updateTaskDraft("description", event.target.value)} placeholder="Опишите задачу и ожидаемый результат" value={taskDraft.description} />
                  </label>
                  <label className="filter-field task-form-wide">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateTaskDraft("notes", event.target.value)} placeholder="Дополнительные условия или комментарии" value={taskDraft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {taskFormMessage ? <p className="draft-message">{taskFormMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeTaskModal} type="button">
                Отмена
              </button>
              <button className="primary-command journal-modal-submit" type="submit">
                {isEditingTask ? "Сохранить изменения" : "Сохранить задание"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {tradeModalType ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal journal-modal" onSubmit={handleTradeSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>
                  {isEditingTrade
                    ? tradeModalType === "sale"
                      ? "Редактирование продажи"
                      : "Редактирование покупки"
                    : tradeModalType === "sale"
                      ? "Оформление продажи"
                      : "Оформление покупки"}
                </h1>
                <p>
                  {tradeModalType === "sale"
                    ? "«Долг» продаёт предмет сталкеру, группе или вручную указанному покупателю"
                    : "«Долг» покупает предмет у сталкера, группы или вручную указанного продавца"}
                </p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>{tradeModalType === "sale" ? "Покупатель" : "Продавец"}</h2>
                  <span>Профиль, группа или ручной ввод</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>{tradeModalType === "sale" ? "Тип покупателя" : "Тип продавца"}</span>
                    <select
                      disabled={isEditingTrade}
                      onChange={(event) => changeTradeParticipantMode(event.target.value as TradeParticipantMode)}
                      value={tradeDraft.participantMode}
                    >
                      <option value="stalker">Профиль сталкера</option>
                      <option value="group">Группа сталкеров</option>
                      <option value="manual">Ручной ввод</option>
                    </select>
                  </label>

                  {tradeDraft.participantMode === "stalker" ? (
                    <SearchableEntityPicker
                      appliedQuery={tradeStalkerSearch.appliedQuery}
                      disabled={isEditingTrade}
                      hasSearched={tradeStalkerSearch.hasSearched}
                      onApply={() => applyEntitySearch(setTradeStalkerSearch)}
                      onQueryChange={(value) => setTradeStalkerSearch((currentSearch) => ({ ...currentSearch, query: value }))}
                      onReset={() => updateTradeDraft("stalkerId", "")}
                      onSelect={(id) => updateTradeDraft("stalkerId", id)}
                      placeholder="Позывной, ФИО или номер профиля"
                      query={tradeStalkerSearch.query}
                      results={tradeStalkerSearchResults}
                      selectedLabel={getSelectedProfileLabel(tradeDraft.stalkerId)}
                      selectedPrefix={tradeModalType === "sale" ? "Выбран покупатель" : "Выбран продавец"}
                      title="Поиск сталкерского профиля"
                    />
                  ) : null}

                  {tradeDraft.participantMode === "group" ? (
                    <SearchableEntityPicker
                      appliedQuery={tradeGroupSearch.appliedQuery}
                      disabled={isEditingTrade}
                      hasSearched={tradeGroupSearch.hasSearched}
                      onApply={() => applyEntitySearch(setTradeGroupSearch)}
                      onQueryChange={(value) => setTradeGroupSearch((currentSearch) => ({ ...currentSearch, query: value }))}
                      onReset={() => updateTradeDraft("groupId", "")}
                      onSelect={(id) => updateTradeDraft("groupId", id)}
                      placeholder="Название группы или участник"
                      query={tradeGroupSearch.query}
                      results={tradeGroupSearchResults}
                      selectedLabel={getSelectedGroupLabel(tradeDraft.groupId)}
                      selectedPrefix={tradeModalType === "sale" ? "Выбрана группа-покупатель" : "Выбрана группа-продавец"}
                      title="Поиск группы сталкеров"
                    />
                  ) : null}

                  {tradeDraft.participantMode === "manual" ? (
                    <label className="filter-field">
                      <span>{tradeModalType === "sale" ? "Покупатель" : "Продавец"}</span>
                      <input
                        disabled={isEditingTrade}
                        onChange={(event) => updateTradeDraft("manualParticipantName", event.target.value)}
                        placeholder="Имя или позывной"
                        type="text"
                        value={tradeDraft.manualParticipantName}
                      />
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Предмет и сумма</h2>
                  <span>Один предмет сохраняется как элемент списка</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Предмет</span>
                    <input
                      onChange={(event) => updateTradeDraft("itemName", event.target.value)}
                      placeholder="Название предмета"
                      type="text"
                      value={tradeDraft.itemName}
                    />
                  </label>
                  <label className="filter-field">
                    <span>Количество</span>
                    <input
                      min="0"
                      onChange={(event) => updateTradeDraft("quantity", event.target.value)}
                      type="number"
                      value={tradeDraft.quantity}
                    />
                  </label>
                  <label className="filter-field">
                    <span>Цена за единицу</span>
                    <input
                      min="0"
                      onChange={(event) => updateTradeDraft("price", event.target.value)}
                      type="number"
                      value={tradeDraft.price}
                    />
                  </label>
                  <label className="filter-field">
                    <span>Общая сумма</span>
                    <input readOnly type="text" value={formatMoney(tradeDraftTotal)} />
                  </label>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Оформление</h2>
                  <span>Дата, ответственный и заметки</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Дата операции</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateTradeDraft("operationDate", event.target.value)} type="date" value={tradeDraft.operationDate} />
                  </label>
                  <label className="filter-field">
                    <span>Кто оформил</span>
                    <input onChange={(event) => updateTradeDraft("issuedBy", event.target.value)} placeholder="Позывной или должность" type="text" value={tradeDraft.issuedBy} />
                  </label>
                  <label className="filter-field task-form-wide">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateTradeDraft("notes", event.target.value)} placeholder="Комментарий к операции" value={tradeDraft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {tradeFormMessage ? <p className="draft-message">{tradeFormMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeTradeModal} type="button">
                Отмена
              </button>
              <button className="primary-command journal-modal-submit" type="submit">
                {isEditingTrade
                  ? "Сохранить изменения"
                  : tradeModalType === "sale"
                    ? "Сохранить продажу"
                    : "Сохранить покупку"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isViolationModalOpen ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal journal-modal" onSubmit={handleViolationSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{isEditingViolation ? "Редактирование нарушения" : "Оформление нарушения"}</h1>
                <p>Запись будет добавлена в общий журнал нарушений и сохранена в базе данных</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Нарушитель</h2>
                  <span>Профиль или ручной ввод</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Тип нарушителя</span>
                    <select
                      disabled={isEditingViolation}
                      onChange={(event) => changeViolationMode(event.target.value as ViolationMode)}
                      value={violationDraft.violatorType}
                    >
                      <option value="profile">Профиль сталкера</option>
                      <option value="manual">Ручной ввод</option>
                    </select>
                  </label>

                  {violationDraft.violatorType === "profile" ? (
                    <SearchableEntityPicker
                      appliedQuery={violationProfileSearch.appliedQuery}
                      disabled={isEditingViolation}
                      hasSearched={violationProfileSearch.hasSearched}
                      onApply={() => applyEntitySearch(setViolationProfileSearch)}
                      onQueryChange={(value) => setViolationProfileSearch((currentSearch) => ({ ...currentSearch, query: value }))}
                      onReset={() => updateViolationDraft("profileId", "")}
                      onSelect={(id) => updateViolationDraft("profileId", id)}
                      placeholder="Позывной, ФИО или номер профиля"
                      query={violationProfileSearch.query}
                      results={violationProfileSearchResults}
                      selectedLabel={getSelectedProfileLabel(violationDraft.profileId)}
                      selectedPrefix="Выбран нарушитель"
                      title="Поиск сталкерского профиля"
                    />
                  ) : null}

                  {violationDraft.violatorType === "manual" ? (
                    <label className="filter-field">
                      <span>Нарушитель</span>
                      <input
                        disabled={isEditingViolation}
                        onChange={(event) => updateViolationDraft("manualViolatorName", event.target.value)}
                        placeholder="Имя или позывной"
                        type="text"
                        value={violationDraft.manualViolatorName}
                      />
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Данные нарушения</h2>
                  <span>Описание, дата и ответственный</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Дата нарушения</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateViolationDraft("date", event.target.value)} type="date" value={violationDraft.date} />
                  </label>
                  <label className="filter-field">
                    <span>Кто оформил</span>
                    <input onChange={(event) => updateViolationDraft("issuedBy", event.target.value)} placeholder="Позывной или должность" type="text" value={violationDraft.issuedBy} />
                  </label>
                  <label className="filter-field task-form-wide">
                    <span>Описание нарушения</span>
                    <textarea onChange={(event) => updateViolationDraft("description", event.target.value)} placeholder="Опишите нарушение" value={violationDraft.description} />
                  </label>
                  <label className="filter-field task-form-wide">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateViolationDraft("notes", event.target.value)} placeholder="Дополнительные комментарии" value={violationDraft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {violationFormMessage ? <p className="draft-message">{violationFormMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeViolationModal} type="button">
                Отмена
              </button>
              <button className="primary-command journal-modal-submit" type="submit">
                {isEditingViolation ? "Сохранить изменения" : "Сохранить нарушение"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {closingViolationId ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-complete-modal journal-action-modal" onSubmit={closeViolationRecord}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Закрыть нарушение</h1>
                <p>
                  {violations.find((violation) => violation.id === closingViolationId)?.description ?? "Нарушение"}
                </p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Подтверждение</h2>
                  <span>Нарушение останется в истории и перейдёт в погашенные</span>
                </div>
                <label className="filter-field">
                  <span>Что сталкер сделал для закрытия нарушения</span>
                  <textarea
                    onChange={(event) => {
                      setViolationClosureNote(event.target.value);
                      setViolationClosureMessage("");
                    }}
                    placeholder="Опишите, что сталкер сделал для закрытия нарушения"
                    value={violationClosureNote}
                  />
                </label>
              </section>
            </div>

            <div className="modal-message-slot">
              {violationClosureMessage ? <p className="draft-message">{violationClosureMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeCloseViolationModal} type="button">
                Отмена
              </button>
              <button className="primary-command journal-modal-submit journal-modal-submit-warning" type="submit">
                Закрыть нарушение
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {confirmDialog ? (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          confirmTone={confirmDialog.confirmTone}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
        />
      ) : null}
    </main>
  );
}