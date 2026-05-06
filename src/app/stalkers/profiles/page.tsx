"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { Pagination } from "@/components/ui/Pagination";
import { getTaskActionVisibility, TaskRecordCard } from "@/components/ui/TaskRecordCard";
import { TradeRecordCard } from "@/components/ui/TradeRecordCard";
import { ViolationRecordCard } from "@/components/ui/ViolationRecordCard";
import { addActivityLogEntry } from "@/lib/activity-log";
import {
  stalkerGroups as initialStalkerGroups,
  stalkerProfiles as initialStalkerProfiles,
  tasks as initialTasks,
  tradeOperations as initialTradeOperations,
} from "@/lib/mock-data";
import type {
  StalkerAffiliation,
  StalkerGroup,
  StalkerGroupRoleType,
  StalkerProfile,
  Task,
  TradeOperation,
  TradeType,
  Violation,
} from "@/lib/types";
import {
  affiliationLabels,
  forceSystemYear,
  getAffiliationBadgeClass,
  getAffiliationLabel,
  getGroupRoleLabel,
  getPaginatedItems,
  getProfileStateBadgeClass,
  getProfileTitle,
  getSystemTimestamp,
  getSystemToday,
  getTodayDate,
  groupRoleLabels,
  isTaskOverdue,
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

const profileTabs = ["Задания", "Продажи", "Покупки", "Нарушения"];

const statusLabels: Record<StalkerProfile["status"], string> = {
  active: "Активен",
  archive: "Архив",
};

const taskStatusLabels: Record<Task["status"], string> = {
  active: "Активное",
  completed: "Выполненное",
  cancelled: "Отменено",
};

type StalkerProfileApiResponse = {
  id: string;
  registryNumber: string | null;
  fullName: string;
  callsign: string;
  birthDate: string | null;
  affiliation: StalkerAffiliation | null;
  photoUrl: string | null;
  appearance: string | null;
  notes: string | null;
  status: StalkerProfile["status"];
  taskMark?: StalkerProfile["taskMark"];
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

const emptyDraft = {
  fullName: "",
  callsign: "",
  registryNumber: "",
  birthDate: "",
  affiliation: "",
  photoUrl: "",
  appearance: "",
  notes: "",
  status: "active" as StalkerProfile["status"],
};

const emptyGroupMemberDraft = {
  groupSearchQuery: "",
  roleType: "member" as StalkerGroupRoleType,
  customRoleName: "",
};

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "Не указана";
}

function normalizeApiProfile(profile: StalkerProfileApiResponse): StalkerProfile {
  return {
    id: profile.id,
    registryNumber: profile.registryNumber ?? undefined,
    fullName: profile.fullName,
    callsign: profile.callsign,
    birthDate: profile.birthDate ?? "",
    affiliation: profile.affiliation ?? undefined,
    photoUrl: profile.photoUrl ?? undefined,
    appearance: profile.appearance ?? "",
    notes: profile.notes ?? "",
    status: profile.status,
    taskMark: profile.taskMark ?? "none",
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    createdBy: profile.createdBy ?? undefined,
    updatedBy: profile.updatedBy ?? undefined,
  };
}

function normalizeDateInputValue(value: string) {
  return value ? value.slice(0, 10) : "";
}

async function readApiError(response: Response) {
  const fallbackMessage = "Сервер вернул ошибку.";

  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function fetchStalkerProfiles() {
  const response = await fetch("/api/stalkers", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const payload = (await response.json()) as StalkerProfileApiResponse[];
  return payload.map(normalizeApiProfile);
}

async function saveStalkerProfileRequest(
  method: "POST" | "PATCH",
  url: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return normalizeApiProfile((await response.json()) as StalkerProfileApiResponse);
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} руб.`;
}

function getAge(birthDate: string) {
  if (!birthDate) {
    return null;
  }

  const birth = new Date(birthDate);
  const today = getSystemToday();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

function getAgeLabel(age: number) {
  const lastDigit = age % 10;
  const lastTwoDigits = age % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${age} лет`;
  }

  if (lastDigit === 1) {
    return `${age} год`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${age} года`;
  }

  return `${age} лет`;
}

function getBirthDateLabel(birthDate: string) {
  if (!birthDate) {
    return "Дата рождения: не указана";
  }

  const age = getAge(birthDate);
  return `Дата рождения: ${formatDate(birthDate)} · ${
    age === null ? "возраст не указан" : getAgeLabel(age)
  }`;
}

function getProfileMetaLine(profile: StalkerProfile) {
  const birthDateLabel = getBirthDateLabel(profile.birthDate);

  if (profile.callsign && profile.fullName) {
    return `${profile.fullName} — ${birthDateLabel}`;
  }

  return birthDateLabel;
}

function getProfileCreatedBy(profile: StalkerProfile) {
  return profile.createdBy?.trim() || "Автор не указан";
}

function getProfileUpdatedBy(profile: StalkerProfile) {
  return profile.updatedBy?.trim() || "Редактор не указан";
}

function createEmptyTaskDraft() {
  return {
    issuedAt: getTodayDate(),
    dueAt: "",
    description: "",
    reward: "",
    notes: "",
    issuedBy: "",
  };
}

function createEmptyTradeDraft(type: TradeType) {
  return {
    type,
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
    date: getTodayDate(),
    description: "",
    issuedBy: "",
    notes: "",
  };
}

function getTaskStatusLabel(task: Task) {
  if (task.status === "completed") {
    return taskStatusLabels.completed;
  }

  if (task.status === "cancelled") {
    return taskStatusLabels.cancelled;
  }

  if (isTaskOverdue(task)) {
    return "Просроченное";
  }

  return taskStatusLabels.active;
}

function getTaskStatusClass(task: Task) {
  if (task.status === "completed") {
    return "badge-task-completed";
  }

  if (isTaskOverdue(task)) {
    return "badge-task-overdue";
  }

  if (task.status === "cancelled") {
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

function getEmptySectionMessage(section: string) {
  if (section === "Продажи") {
    return "Записей о продажах пока нет.";
  }

  if (section === "Покупки") {
    return "Записей о покупках пока нет.";
  }

  if (section === "Нарушения") {
    return "Записей о нарушениях пока нет.";
  }

  return "Записей пока нет.";
}

function getProfileGroupIds(profileId: string, groups: StalkerGroup[]) {
  return new Set(
    groups
      .filter((group) => group.members.some((member) => member.stalkerId === profileId))
      .map((group) => group.id),
  );
}

function isTaskAssignedToProfile(task: Task, profileId: string, profileGroupIds: Set<string>) {
  if (task.assigneeType === "stalker") {
    return task.stalkerId === profileId;
  }

  if (task.assigneeType === "group") {
    return Boolean(task.groupId && profileGroupIds.has(task.groupId));
  }

  return false;
}

function getComputedTaskMark(profileId: string, tasks: Task[], groups: StalkerGroup[]) {
  const profileGroupIds = getProfileGroupIds(profileId, groups);
  const activeTasks = tasks.filter(
    (task) => isTaskAssignedToProfile(task, profileId, profileGroupIds) && task.status === "active",
  );

  if (activeTasks.some(isTaskOverdue)) {
    return "overdue" as const;
  }

  return activeTasks.length > 0 ? ("active" as const) : ("none" as const);
}

function getProfileServiceBadges({
  isInActiveGroup,
  computedTaskMark,
  activeViolationCount,
}: {
  isInActiveGroup: boolean;
  computedTaskMark: StalkerProfile["taskMark"];
  activeViolationCount: number;
}) {
  const badges: Array<{ label: string; className: string }> = [];

  if (isInActiveGroup) {
    badges.push({ label: "Группа", className: "badge-service-group" });
  }

  if (computedTaskMark === "active") {
    badges.push({ label: "Задание", className: "badge-service-task-active" });
  }

  if (computedTaskMark === "overdue") {
    badges.push({ label: "Задание", className: "badge-service-task-overdue" });
  }

  if (activeViolationCount > 0) {
    badges.push({ label: "Нарушение", className: "badge-service-violation-active" });
  }

  return badges;
}

export default function StalkerProfilesPage() {
  const [profiles, setProfiles] = useState<StalkerProfile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<StalkerGroup[]>([]);
  const [tradeOperations, setTradeOperations] = useState<TradeOperation[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isProfileDeleting, setIsProfileDeleting] = useState(false);
  const [profileLoadMessage, setProfileLoadMessage] = useState("");
  const [profileActionMessage, setProfileActionMessage] = useState("");
  const [localImportProfiles, setLocalImportProfiles] = useState<StalkerProfile[]>([]);
  const [isImportingProfiles, setIsImportingProfiles] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [profileListTab, setProfileListTab] = useState<StalkerProfile["status"]>("active");
  const [activeProfileTab, setActiveProfileTab] = useState("");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileGroupModalOpen, setIsProfileGroupModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState("");
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState("");
  const [completingTaskId, setCompletingTaskId] = useState("");
  const [tradeModalType, setTradeModalType] = useState<TradeType | null>(null);
  const [editingTradeId, setEditingTradeId] = useState("");
  const [isViolationModalOpen, setIsViolationModalOpen] = useState(false);
  const [editingViolationId, setEditingViolationId] = useState("");
  const [closingViolationId, setClosingViolationId] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [taskDraft, setTaskDraft] = useState(createEmptyTaskDraft);
  const [editTaskDraft, setEditTaskDraft] = useState(createEmptyTaskDraft);
  const [completeTaskDraft, setCompleteTaskDraft] = useState({ acceptedBy: "" });
  const [tradeDraft, setTradeDraft] = useState(() => createEmptyTradeDraft("sale"));
  const [violationDraft, setViolationDraft] = useState(createEmptyViolationDraft);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [profilePhotoLoadFailed, setProfilePhotoLoadFailed] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [taskFormMessage, setTaskFormMessage] = useState("");
  const [editTaskMessage, setEditTaskMessage] = useState("");
  const [completeTaskMessage, setCompleteTaskMessage] = useState("");
  const [tradeFormMessage, setTradeFormMessage] = useState("");
  const [violationFormMessage, setViolationFormMessage] = useState("");
  const [violationClosureNote, setViolationClosureNote] = useState("");
  const [violationClosureMessage, setViolationClosureMessage] = useState("");
  const [profileGroupMessage, setProfileGroupMessage] = useState("");
  const [tableMessage, setTableMessage] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [tradeMessage, setTradeMessage] = useState("");
  const [violationMessage, setViolationMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupMemberDraft, setGroupMemberDraft] = useState(emptyGroupMemberDraft);
  const [appliedGroupSearchQuery, setAppliedGroupSearchQuery] = useState<string | null>(null);
  const [profilePage, setProfilePage] = useState(1);

  useEffect(() => {
    let isCancelled = false;

    const storageReadHandle = window.setTimeout(() => {
      const localProfiles = readStoredCollection<StalkerProfile>(STALKER_PROFILES_STORAGE_KEY, initialStalkerProfiles);
      const queryProfileId = new URLSearchParams(window.location.search).get("profileId");

      setTasks(readStoredCollection<Task>(STALKER_TASKS_STORAGE_KEY, initialTasks));
      setGroups(readStoredCollection<StalkerGroup>(STALKER_GROUPS_STORAGE_KEY, initialStalkerGroups));
      setTradeOperations(readStoredCollection<TradeOperation>(TRADE_OPERATIONS_STORAGE_KEY, initialTradeOperations));
      setViolations(readStoredCollection<Violation>(VIOLATIONS_STORAGE_KEY, []));

      async function loadProfiles() {
        setIsProfileLoading(true);
        setProfileLoadMessage("");

        try {
          const serverProfiles = await fetchStalkerProfiles();

          if (isCancelled) {
            return;
          }

          setProfiles(serverProfiles);

          if (serverProfiles.length > 0) {
            writeStoredCollection(STALKER_PROFILES_STORAGE_KEY, serverProfiles);
            setLocalImportProfiles([]);
          } else if (localProfiles.length > 0) {
            setLocalImportProfiles(localProfiles);
          }

          const profileFromQuery = queryProfileId
            ? serverProfiles.find((profile) => profile.id === queryProfileId)
            : null;

          if (profileFromQuery) {
            setSelectedProfileId(profileFromQuery.id);
            setProfileListTab(profileFromQuery.status);
            setActiveProfileTab("");
            setProfilePhotoLoadFailed(false);
          }
        } catch (error) {
          if (isCancelled) {
            return;
          }

          setProfileLoadMessage(
            error instanceof Error
              ? `Не удалось загрузить профили из базы данных: ${error.message}`
              : "Не удалось загрузить профили из базы данных.",
          );

          if (localProfiles.length > 0) {
            setLocalImportProfiles(localProfiles);
          }
        } finally {
          if (!isCancelled) {
            setIsStorageReady(true);
            setIsProfileLoading(false);
          }
        }
      }

      void loadProfiles();
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

    if (profiles.length === 0 && localImportProfiles.length > 0) {
      return;
    }

    writeStoredCollection(STALKER_PROFILES_STORAGE_KEY, profiles);
  }, [isStorageReady, localImportProfiles.length, profiles]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(STALKER_TASKS_STORAGE_KEY, tasks);
  }, [isStorageReady, tasks]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(STALKER_GROUPS_STORAGE_KEY, groups);
  }, [groups, isStorageReady]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(TRADE_OPERATIONS_STORAGE_KEY, tradeOperations);
  }, [isStorageReady, tradeOperations]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(VIOLATIONS_STORAGE_KEY, violations);
  }, [isStorageReady, violations]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);

  const selectedProfileTasks = useMemo(() => {
    if (!selectedProfile) {
      return [];
    }

    const profileGroupIds = getProfileGroupIds(selectedProfile.id, groups);

    return tasks.filter(
      (task) => isTaskAssignedToProfile(task, selectedProfile.id, profileGroupIds),
    );
  }, [groups, selectedProfile, tasks]);

  const selectedProfileSales = useMemo(() => {
    if (!selectedProfile) {
      return [];
    }

    return tradeOperations.filter(
      (operation) =>
        operation.type === "sale" &&
        operation.subjectType === "stalker" &&
        operation.stalkerId === selectedProfile.id,
    );
  }, [selectedProfile, tradeOperations]);

  const selectedProfilePurchases = useMemo(() => {
    if (!selectedProfile) {
      return [];
    }

    return tradeOperations.filter(
      (operation) =>
        operation.type === "purchase" &&
        operation.subjectType === "stalker" &&
        operation.stalkerId === selectedProfile.id,
    );
  }, [selectedProfile, tradeOperations]);

  const selectedProfileViolations = useMemo(() => {
    if (!selectedProfile) {
      return [];
    }

    return violations.filter(
      (violation) =>
        violation.violatorType === "profile" &&
        violation.profileId === selectedProfile.id,
    );
  }, [selectedProfile, violations]);

  const activeViolationCountByProfileId = useMemo(() => {
    const counts = new Map<string, number>();

    violations.forEach((violation) => {
      if (violation.violatorType !== "profile" || !violation.profileId || !isViolationActive(violation)) {
        return;
      }

      counts.set(violation.profileId, (counts.get(violation.profileId) ?? 0) + 1);
    });

    return counts;
  }, [violations]);

  const activeGroupMemberIds = useMemo(() => {
    return new Set(
      groups
        .filter((group) => group.status === "active")
        .flatMap((group) => group.members.map((member) => member.stalkerId)),
    );
  }, [groups]);

  const selectedProfileGroups = useMemo(() => {
    if (!selectedProfile) {
      return [];
    }

    return groups
      .filter((group) => group.status === "active")
      .flatMap((group) => {
        const member = group.members.find((item) => item.stalkerId === selectedProfile.id);
        return member ? [{ group, member }] : [];
      });
  }, [groups, selectedProfile]);

  const activeGroups = useMemo(() => {
    return groups.filter((group) => group.status === "active");
  }, [groups]);

  const profileGroupSearchResults = useMemo(() => {
    if (!selectedProfile || !appliedGroupSearchQuery) {
      return [];
    }

    const query = appliedGroupSearchQuery.toLowerCase();

    return activeGroups
      .filter((group) => !group.members.some((member) => member.stalkerId === selectedProfile.id))
      .filter((group) => group.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [activeGroups, appliedGroupSearchQuery, selectedProfile]);

  function getTaskAssigneeLabel(task: Task) {
    if (task.assigneeType === "group") {
      const group = task.groupId ? groups.find((currentGroup) => currentGroup.id === task.groupId) : null;
      return group ? group.name : "Группа не найдена";
    }

    if (task.assigneeType === "manual") {
      return task.manualAssigneeName || "Исполнитель указан вручную";
    }

    if (selectedProfile && task.stalkerId === selectedProfile.id) {
      return getProfileTitle(selectedProfile);
    }

    const profile = task.stalkerId ? profiles.find((currentProfile) => currentProfile.id === task.stalkerId) : null;
    return profile ? getProfileTitle(profile) : "Профиль не найден";
  }

  const visibleProfiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return profiles
      .filter((profile) => profile.status === profileListTab)
      .filter((profile) => {
        if (!query) {
          return true;
        }

        return [profile.fullName, profile.callsign, profile.registryNumber]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [profileListTab, profiles, searchQuery]);

  const paginatedProfiles = getPaginatedItems(visibleProfiles, profilePage);
  const visibleProfileCount = isStorageReady ? visibleProfiles.length : 0;
  const shownProfileCount = isStorageReady ? paginatedProfiles.items.length : 0;
  const normalizedPhotoUrl = draft.photoUrl.trim();
  const tradeDraftQuantity = Number(tradeDraft.quantity.replace(",", "."));
  const tradeDraftPrice = Number(tradeDraft.price.replace(",", "."));
  const tradeDraftTotal =
    Number.isFinite(tradeDraftQuantity) && Number.isFinite(tradeDraftPrice)
      ? tradeDraftQuantity * tradeDraftPrice
      : 0;

  function updateDraft<Field extends keyof typeof draft>(
    field: Field,
    value: (typeof draft)[Field],
  ) {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));

    if (field === "photoUrl") {
      setPhotoLoadFailed(false);
    }
  }

  function updateTaskDraft<Field extends keyof typeof taskDraft>(
    field: Field,
    value: (typeof taskDraft)[Field],
  ) {
    const nextValue =
      typeof value === "string" && (field === "issuedAt" || field === "dueAt")
        ? (forceSystemYear(value) as (typeof taskDraft)[Field])
        : value;

    setTaskDraft((currentDraft) => ({ ...currentDraft, [field]: nextValue }));
  }

  function updateEditTaskDraft<Field extends keyof typeof editTaskDraft>(
    field: Field,
    value: (typeof editTaskDraft)[Field],
  ) {
    const nextValue =
      typeof value === "string" && (field === "issuedAt" || field === "dueAt")
        ? (forceSystemYear(value) as (typeof editTaskDraft)[Field])
        : value;

    setEditTaskDraft((currentDraft) => ({ ...currentDraft, [field]: nextValue }));
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

  function resetProfileDraft() {
    setDraft(emptyDraft);
    setPhotoLoadFailed(false);
    setFormMessage("");
    setEditingProfileId("");
  }

  function resetGroupMemberDraft() {
    setGroupMemberDraft(emptyGroupMemberDraft);
    setAppliedGroupSearchQuery(null);
    setProfileGroupMessage("");
  }

  function applyGroupSearch() {
    const query = groupMemberDraft.groupSearchQuery.trim();

    setAppliedGroupSearchQuery(query || null);
  }

  function handleGroupSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      applyGroupSearch();
    }
  }

  function openCreateProfile() {
    resetProfileDraft();
    setIsProfileModalOpen(true);
  }

  function openEditProfile(profile: StalkerProfile) {
    setDraft({
      fullName: profile.fullName,
      callsign: profile.callsign,
      registryNumber: profile.registryNumber ?? "",
      birthDate: normalizeDateInputValue(profile.birthDate),
      affiliation: profile.affiliation ?? "",
      photoUrl: profile.photoUrl ?? "",
      appearance: profile.appearance,
      notes: profile.notes,
      status: profile.status,
    });
    setEditingProfileId(profile.id);
    setFormMessage("");
    setPhotoLoadFailed(false);
    setIsProfileModalOpen(true);
  }

  function closeProfileModal() {
    setIsProfileModalOpen(false);
    resetProfileDraft();
  }

  function openProfileGroupModal() {
    resetGroupMemberDraft();
    setIsProfileGroupModalOpen(true);
  }

  function closeProfileGroupModal() {
    setIsProfileGroupModalOpen(false);
    resetGroupMemberDraft();
  }

  function addProfileToGroup(groupId: string) {
    if (!selectedProfile) {
      return;
    }

    const customRoleName = groupMemberDraft.customRoleName.trim();

    if (groupMemberDraft.roleType === "custom" && !customRoleName) {
      setProfileGroupMessage("Укажите название роли.");
      return;
    }

    const now = getSystemTimestamp();

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              members: [
                ...group.members,
                {
                  id: `member-${selectedProfile.id}-${Date.now()}`,
                  stalkerId: selectedProfile.id,
                  roleType: groupMemberDraft.roleType,
                  customRoleName: groupMemberDraft.roleType === "custom" ? customRoleName : null,
                  joinedAt: now,
                },
              ],
              updatedAt: now,
            }
          : group,
      ),
    );
    closeProfileGroupModal();
    setTableMessage("Профиль добавлен в группу.");
  }

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fullName = draft.fullName.trim();
    const callsign = draft.callsign.trim();

    if (!fullName && !callsign) {
      setFormMessage("Укажите ФИО или позывной.");
      return;
    }

    const payload = {
      registryNumber: draft.registryNumber.trim() || null,
      fullName,
      callsign,
      birthDate: draft.birthDate || null,
      affiliation: draft.affiliation || null,
      photoUrl: normalizedPhotoUrl || null,
      appearance: draft.appearance.trim() || null,
      notes: draft.notes.trim() || null,
      status: draft.status,
    };

    setIsProfileSaving(true);
    setFormMessage("");

    try {
      if (editingProfileId) {
        const profileTitle = callsign || fullName || "Без имени";
        const updatedProfile = await saveStalkerProfileRequest(
          "PATCH",
          `/api/stalkers/${encodeURIComponent(editingProfileId)}`,
          payload,
        );

        setProfiles((currentProfiles) =>
          currentProfiles.map((profile) => (profile.id === editingProfileId ? updatedProfile : profile)),
        );
        setProfileListTab(updatedProfile.status);
        setTableMessage("Профиль обновлён в базе данных.");
        addActivityLogEntry({
          type: "stalker",
          title: `Изменён профиль сталкера: ${profileTitle}`,
          status: "OK",
        });
      } else {
        const profileTitle = callsign || fullName || "Без имени";
        const newProfile = await saveStalkerProfileRequest("POST", "/api/stalkers", payload);

        setProfiles((currentProfiles) => [newProfile, ...currentProfiles]);
        setSelectedProfileId(newProfile.id);
        setProfileListTab(newProfile.status);
        setTableMessage("Профиль сохранён в базе данных.");
        addActivityLogEntry({
          type: "stalker",
          title: `Создан профиль сталкера: ${profileTitle}`,
          status: "OK",
        });
      }

      setProfilePage(1);
      setActiveProfileTab("");
      setIsProfileModalOpen(false);
      resetProfileDraft();
    } catch (error) {
      setFormMessage(
        error instanceof Error
          ? `Не удалось сохранить профиль: ${error.message}`
          : "Не удалось сохранить профиль.",
      );
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function setProfileStatus(profileId: string, status: StalkerProfile["status"]) {
    const profile = profiles.find((currentProfile) => currentProfile.id === profileId);
    const profileTitle = profile ? getProfileTitle(profile) : "Без имени";

    setProfileActionMessage("");
    setIsProfileSaving(true);

    try {
      const updatedProfile = await saveStalkerProfileRequest(
        "PATCH",
        `/api/stalkers/${encodeURIComponent(profileId)}`,
        { status },
      );

      setProfiles((currentProfiles) =>
        currentProfiles.map((profile) => (profile.id === profileId ? updatedProfile : profile)),
      );
      setProfileListTab(status);
      setSelectedProfileId("");
      setProfilePage(1);
      setTableMessage(status === "archive" ? "Профиль перенесён в архив." : "Профиль возвращён в активные.");
      addActivityLogEntry({
        type: "stalker",
        title:
          status === "archive"
            ? `Профиль перенесён в архив: ${profileTitle}`
            : `Профиль возвращён из архива: ${profileTitle}`,
        status: status === "archive" ? "WARN" : "OK",
      });
    } catch (error) {
      setProfileActionMessage(
        error instanceof Error
          ? `Не удалось изменить статус профиля: ${error.message}`
          : "Не удалось изменить статус профиля.",
      );
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function deleteProfile(profileId: string) {
    const profile = profiles.find((currentProfile) => currentProfile.id === profileId);

    if (!window.confirm("Удалить профиль окончательно?")) {
      return;
    }

    setProfileActionMessage("");
    setIsProfileDeleting(true);

    try {
      const response = await fetch(`/api/stalkers/${encodeURIComponent(profileId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setProfiles((currentProfiles) => currentProfiles.filter((profile) => profile.id !== profileId));
      setTasks((currentTasks) => currentTasks.filter((task) => task.stalkerId !== profileId));
      setGroups((currentGroups) =>
        currentGroups.map((group) => ({
          ...group,
          members: group.members.filter((member) => member.stalkerId !== profileId),
          updatedAt: getSystemTimestamp(),
        })),
      );
      setSelectedProfileId("");
      setProfilePage(1);
      setTableMessage("Профиль удалён из базы данных. Локальные связанные записи обновлены.");
      addActivityLogEntry({
        type: "stalker",
        title: `Профиль удалён: ${profile ? getProfileTitle(profile) : "Без имени"}`,
        status: "WARN",
      });
    } catch (error) {
      setProfileActionMessage(
        error instanceof Error
          ? `Не удалось удалить профиль: ${error.message}`
          : "Не удалось удалить профиль.",
      );
    } finally {
      setIsProfileDeleting(false);
    }
  }

  async function importLocalProfiles() {
    if (localImportProfiles.length === 0) {
      return;
    }

    setIsImportingProfiles(true);
    setProfileActionMessage("");

    try {
      const response = await fetch("/api/stalkers/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(localImportProfiles),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const importedProfiles = ((await response.json()) as StalkerProfileApiResponse[]).map(normalizeApiProfile);
      setProfiles(importedProfiles);
      writeStoredCollection(STALKER_PROFILES_STORAGE_KEY, importedProfiles);
      setLocalImportProfiles([]);
      setProfilePage(1);
      setTableMessage("Локальные профили импортированы в базу данных.");
    } catch (error) {
      setProfileActionMessage(
        error instanceof Error
          ? `Не удалось импортировать локальные профили: ${error.message}`
          : "Не удалось импортировать локальные профили.",
      );
    } finally {
      setIsImportingProfiles(false);
    }
  }

  function selectProfile(profileId: string) {
    setSelectedProfileId(profileId);
    setActiveProfileTab("");
    setProfilePhotoLoadFailed(false);
  }

  function closeTaskDialog() {
    setIsTaskOpen(false);
    setTaskDraft(createEmptyTaskDraft());
    setTaskFormMessage("");
  }

  function openEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditTaskDraft({
      issuedAt: task.issuedAt,
      dueAt: task.dueAt,
      description: task.description,
      reward: task.reward,
      notes: task.notes,
      issuedBy: task.issuedBy,
    });
    setEditTaskMessage("");
  }

  function closeEditTaskDialog() {
    setEditingTaskId("");
    setEditTaskDraft(createEmptyTaskDraft());
    setEditTaskMessage("");
  }

  function openCompleteTask(task: Task) {
    setCompletingTaskId(task.id);
    setCompleteTaskDraft({ acceptedBy: task.acceptedBy ?? "" });
    setCompleteTaskMessage("");
  }

  function closeCompleteTaskDialog() {
    setCompletingTaskId("");
    setCompleteTaskDraft({ acceptedBy: "" });
    setCompleteTaskMessage("");
  }

  function openTradeModal(type: TradeType) {
    setTradeDraft(createEmptyTradeDraft(type));
    setEditingTradeId("");
    setTradeFormMessage("");
    setTradeModalType(type);
  }

  function openEditTradeModal(operation: TradeOperation) {
    const firstItem = operation.items[0];
    setTradeDraft({
      type: operation.type,
      itemName: firstItem?.name ?? "",
      quantity: firstItem ? String(firstItem.quantity) : "1",
      price: firstItem ? String(firstItem.price) : "",
      issuedBy: operation.issuedBy,
      notes: operation.notes,
      operationDate: operation.operationDate ?? operation.createdAt.slice(0, 10),
    });
    setEditingTradeId(operation.id);
    setTradeFormMessage("");
    setTradeModalType(operation.type);
  }

  function closeTradeModal() {
    setTradeModalType(null);
    setEditingTradeId("");
    setTradeDraft(createEmptyTradeDraft("sale"));
    setTradeFormMessage("");
  }

  function openViolationModal() {
    setViolationDraft(createEmptyViolationDraft());
    setEditingViolationId("");
    setViolationFormMessage("");
    setIsViolationModalOpen(true);
  }

  function openEditViolationModal(violation: Violation) {
    setViolationDraft({
      date: violation.date,
      description: violation.description,
      issuedBy: violation.issuedBy,
      notes: violation.notes,
    });
    setEditingViolationId(violation.id);
    setViolationFormMessage("");
    setIsViolationModalOpen(true);
  }

  function closeViolationModal() {
    setIsViolationModalOpen(false);
    setEditingViolationId("");
    setViolationDraft(createEmptyViolationDraft());
    setViolationFormMessage("");
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

  function handleTaskSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProfile) {
      return;
    }

    if (selectedProfile.affiliation === "duty") {
      setTaskFormMessage("Задания членам «Долга» не выдаются.");
      return;
    }

    const description = taskDraft.description.trim();

    if (!description) {
      setTaskFormMessage("Опишите задание.");
      return;
    }

    const newTask: Task = {
      id: `temp-task-${Date.now()}`,
      assigneeType: "stalker",
      stalkerId: selectedProfile.id,
      groupId: null,
      issuedAt: taskDraft.issuedAt,
      dueAt: taskDraft.dueAt,
      description,
      reward: taskDraft.reward.trim(),
      notes: taskDraft.notes.trim(),
      issuedBy: taskDraft.issuedBy.trim(),
      acceptedBy: null,
      completedAt: null,
      status: "active",
    };

    setTasks((currentTasks) => [newTask, ...currentTasks]);
    closeTaskDialog();
    setTaskMessage("Задание сохранено локально.");
    addActivityLogEntry({
      type: "task",
      title: `Выдано задание из профиля: ${description}`,
      status: "OK",
      description: `Получатель: ${getProfileTitle(selectedProfile)}`,
    });
  }

  function handleTradeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProfile) {
      return;
    }

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

    const now = getSystemTimestamp();
    const item = {
      id: `profile-trade-item-${Date.now()}`,
      name: itemName,
      quantity,
      price,
      notes: "",
    };

    if (editingTradeId) {
      setTradeOperations((currentOperations) =>
        currentOperations.map((operation) => {
          if (operation.id !== editingTradeId) {
            return operation;
          }

          return {
            ...operation,
            items: [
              {
                ...item,
                id: operation.items[0]?.id ?? item.id,
              },
            ],
            totalAmount: quantity * price,
            issuedBy: tradeDraft.issuedBy.trim(),
            notes: tradeDraft.notes.trim(),
            operationDate: tradeDraft.operationDate,
            updatedAt: now,
          };
        }),
      );
      setTradeMessage(tradeDraft.type === "sale" ? "Продажа обновлена." : "Покупка обновлена.");
      setActiveProfileTab(tradeDraft.type === "sale" ? "Продажи" : "Покупки");
      closeTradeModal();
      return;
    }

    const newOperation: TradeOperation = {
      id: `profile-trade-${tradeDraft.type}-${Date.now()}`,
      type: tradeDraft.type,
      subjectType: "stalker",
      stalkerId: selectedProfile.id,
      groupId: null,
      items: [item],
      totalAmount: quantity * price,
      issuedBy: tradeDraft.issuedBy.trim(),
      notes: tradeDraft.notes.trim(),
      operationDate: tradeDraft.operationDate,
      createdAt: now,
      updatedAt: now,
    };

    setTradeOperations((currentOperations) => [newOperation, ...currentOperations]);
    setTradeMessage(tradeDraft.type === "sale" ? "Продажа сохранена локально." : "Покупка сохранена локально.");
    setActiveProfileTab(tradeDraft.type === "sale" ? "Продажи" : "Покупки");
    closeTradeModal();
    addActivityLogEntry({
      type: "trade",
      title:
        tradeDraft.type === "sale"
          ? `Оформлена продажа из профиля: ${itemName} — ${getProfileTitle(selectedProfile)}`
          : `Оформлена покупка из профиля: ${itemName} — ${getProfileTitle(selectedProfile)}`,
      status: "OK",
    });
  }

  function deleteTradeOperation(operation: TradeOperation) {
    const confirmMessage = operation.type === "sale" ? "Удалить запись о продаже?" : "Удалить запись о покупке?";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setTradeOperations((currentOperations) =>
      currentOperations.filter((currentOperation) => currentOperation.id !== operation.id),
    );
    setTradeMessage(operation.type === "sale" ? "Продажа удалена." : "Покупка удалена.");
  }

  function handleViolationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProfile) {
      return;
    }

    const description = violationDraft.description.trim();

    if (!description) {
      setViolationFormMessage("Опишите нарушение.");
      return;
    }

    const now = getSystemTimestamp();

    if (editingViolationId) {
      setViolations((currentViolations) =>
        currentViolations.map((violation) =>
          violation.id === editingViolationId
            ? {
                ...violation,
                date: violationDraft.date,
                description,
                issuedBy: violationDraft.issuedBy.trim(),
                notes: violationDraft.notes.trim(),
                updatedAt: now,
              }
            : violation,
        ),
      );
      setViolationMessage("Нарушение обновлено.");
      setActiveProfileTab("Нарушения");
      closeViolationModal();
      return;
    }

    const newViolation: Violation = {
      id: `profile-violation-${Date.now()}`,
      violatorType: "profile",
      profileId: selectedProfile.id,
      status: "active",
      date: violationDraft.date,
      description,
      issuedBy: violationDraft.issuedBy.trim(),
      notes: violationDraft.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };

    setViolations((currentViolations) => [newViolation, ...currentViolations]);
    setViolationMessage("Нарушение сохранено локально.");
    setActiveProfileTab("Нарушения");
    closeViolationModal();
    addActivityLogEntry({
      type: "stalker",
      title: `Оформлено нарушение из профиля: ${getProfileTitle(selectedProfile)}`,
      status: "WARN",
      description,
    });
  }

  function deleteViolationRecord(violationId: string) {
    if (!window.confirm("Удалить запись о нарушении?")) {
      return;
    }

    setViolations((currentViolations) => currentViolations.filter((violation) => violation.id !== violationId));
    setViolationMessage("Нарушение удалено.");
  }

  function closeViolationRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const closureNote = violationClosureNote.trim();

    if (!closureNote) {
      setViolationClosureMessage("Опишите, что сталкер сделал для закрытия нарушения.");
      return;
    }

    const now = getSystemTimestamp();

    setViolations((currentViolations) =>
      currentViolations.map((violation) =>
        violation.id === closingViolationId
          ? {
              ...violation,
              status: "closed",
              closedAt: now,
              closureNote,
              updatedAt: now,
            }
          : violation,
      ),
    );
    setViolationMessage("Нарушение погашено.");
    setActiveProfileTab("Нарушения");
    closeCloseViolationModal();
    if (selectedProfile) {
      addActivityLogEntry({
        type: "stalker",
        title: `Нарушение закрыто из профиля: ${getProfileTitle(selectedProfile)}`,
        status: "OK",
        description: closureNote,
      });
    }
  }

  function handleEditTaskSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const description = editTaskDraft.description.trim();

    if (!description) {
      setEditTaskMessage("Опишите задание.");
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === editingTaskId
          ? {
              ...task,
              issuedAt: editTaskDraft.issuedAt,
              dueAt: editTaskDraft.dueAt,
              description,
              reward: editTaskDraft.reward.trim(),
              notes: editTaskDraft.notes.trim(),
              issuedBy: editTaskDraft.issuedBy.trim(),
            }
          : task,
      ),
    );
    closeEditTaskDialog();
    setTaskMessage("Задание обновлено.");
  }

  function handleCompleteTaskSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const acceptedBy = completeTaskDraft.acceptedBy.trim();

    if (!acceptedBy) {
      setCompleteTaskMessage("Укажите, кто засчитал задание.");
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === completingTaskId
          ? {
              ...task,
              status: "completed",
              acceptedBy,
              completedAt: task.completedAt || getTodayDate(),
            }
          : task,
      ),
    );
    closeCompleteTaskDialog();
    setTaskMessage("Задание засчитано.");
    if (selectedProfile) {
      const task = tasks.find((currentTask) => currentTask.id === completingTaskId);
      const assigneeLabel = task ? getTaskAssigneeLabel(task) : getProfileTitle(selectedProfile);
      addActivityLogEntry({
        type: "task",
        title:
          task?.assigneeType === "group"
            ? `Групповое задание выполнено: ${assigneeLabel} — ${task.description || "Без описания"}`
            : `Задание выполнено из профиля: ${task?.description || "Без описания"}`,
        status: "OK",
        description: `Исполнитель: ${assigneeLabel}`,
      });
    }
  }

  function cancelTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);

    if (!task || task.status !== "active") {
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.map((currentTask) =>
        currentTask.id === taskId
          ? {
              ...currentTask,
              status: "cancelled",
            }
          : currentTask,
      ),
    );
    setTaskMessage("Задание отменено.");
    addActivityLogEntry({
      type: "task",
      title:
        task.assigneeType === "group"
          ? `Групповое задание отменено: ${getTaskAssigneeLabel(task)} — ${task.description || "Без описания"}`
          : `Задание отменено из профиля: ${task.description || "Без описания"}`,
      status: "WARN",
      description: `Исполнитель: ${getTaskAssigneeLabel(task)}`,
    });
  }

  function deleteTask(taskId: string) {
    if (!window.confirm("Удалить задание окончательно?")) {
      return;
    }

    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    setTaskMessage("Задание удалено.");
  }

  function changeListTab(tab: StalkerProfile["status"]) {
    setProfileListTab(tab);
    setProfilePage(1);
    setSelectedProfileId("");
  }

  function changeSearchQuery(value: string) {
    setSearchQuery(value);
    setProfilePage(1);
  }

  function renderProfileTradeRecords(type: TradeType) {
    const isSale = type === "sale";
    const operations = isSale ? selectedProfileSales : selectedProfilePurchases;
    const participantLabel = selectedProfile ? getProfileTitle(selectedProfile) : "Профиль не выбран";

    return (
      <div className="task-section">
        {tradeMessage ? <p className="table-message">{tradeMessage}</p> : null}

        <div className="task-list">
          {operations.length > 0 ? (
            operations.map((operation) => (
              <TradeRecordCard
                actions={
                  <>
                    <button className="command-row task-action-button" onClick={() => openEditTradeModal(operation)} type="button">
                      Редактировать
                    </button>
                    <button className="command-row task-action-button" onClick={() => deleteTradeOperation(operation)} type="button">
                      Удалить
                    </button>
                  </>
                }
                formatDate={formatDate}
                formatMoney={formatMoney}
                key={operation.id}
                operation={operation}
                participantLabel={participantLabel}
                participantRoleLabel={isSale ? "Покупатель" : "Продавец"}
                typeLabel={isSale ? "Продажа" : "Покупка"}
              />
            ))
          ) : (
            <div className="empty-state">
              <p>{isSale ? "Продаж пока нет." : "Покупок пока нет."}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderProfileViolations() {
    const violatorLabel = selectedProfile ? getProfileTitle(selectedProfile) : "Профиль не выбран";

    return (
      <div className="task-section">
        {violationMessage ? <p className="table-message">{violationMessage}</p> : null}

        <div className="task-list">
          {selectedProfileViolations.length > 0 ? (
            selectedProfileViolations.map((violation) => (
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
                    <button className="command-row task-action-button" onClick={() => deleteViolationRecord(violation.id)} type="button">
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
                violatorLabel={violatorLabel}
              />
            ))
          ) : (
            <div className="empty-state">
              <p>Нарушений пока нет.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderProfileRecordAction() {
    if (activeProfileTab === "Задания") {
      return (
        <button className="command-row dossier-record-action" onClick={() => setIsTaskOpen(true)} type="button">
          Выдать задание
        </button>
      );
    }

    if (activeProfileTab === "Продажи") {
      return (
        <button className="command-row dossier-record-action" onClick={() => openTradeModal("sale")} type="button">
          Оформить продажу
        </button>
      );
    }

    if (activeProfileTab === "Покупки") {
      return (
        <button className="command-row dossier-record-action" onClick={() => openTradeModal("purchase")} type="button">
          Оформить покупку
        </button>
      );
    }

    if (activeProfileTab === "Нарушения") {
      return (
        <button className="command-row dossier-record-action" onClick={openViolationModal} type="button">
          Оформить нарушение
        </button>
      );
    }

    return null;
  }

  function openGroupsPage() {
    window.location.href = "/stalkers/groups";
  }

  function handleGroupCardKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openGroupsPage();
    }
  }

  const selectedTaskMark = selectedProfile
    ? getComputedTaskMark(selectedProfile.id, tasks, groups)
    : "none";
  const selectedProfileActiveViolationCount = selectedProfile
    ? activeViolationCountByProfileId.get(selectedProfile.id) ?? 0
    : 0;

  return (
    <main className="pda-page profiles-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Сталкеры" activeSubtab="Профили" />

        <div className="pda-content">
          <section className="section-panel profiles-workspace-panel">
            <div className="profile-card-grid profiles-command-grid">
              <section className="profile-column profiles-list-column">
                <div className="list-header-block">
                  <div className="column-header list-column-header">
                    <h2>Реестр сталкеров</h2>
                    <button className="primary-command profile-create-button" onClick={openCreateProfile} type="button">
                      Создать профиль
                    </button>
                  </div>

                  <div className="list-tabs segmented-tabs" role="tablist" aria-label="Статус профилей">
                    <button className={profileListTab === "active" ? "list-tab list-tab-active" : "list-tab"} onClick={() => changeListTab("active")} type="button">
                      Активные
                    </button>
                    <button className={profileListTab === "archive" ? "list-tab list-tab-active" : "list-tab"} onClick={() => changeListTab("archive")} type="button">
                      Архив
                    </button>
                  </div>
                </div>

                <div className="filter-bar profile-list-filter">
                  <label className="filter-field">
                    <span className="filter-label-row">
                      <span>Поиск</span>
                      <span>Записей: {shownProfileCount} из {visibleProfileCount}</span>
                    </span>
                    <input
                      onChange={(event) => changeSearchQuery(event.target.value)}
                      placeholder="ФИО, позывной, внутренний номер"
                      type="text"
                      value={searchQuery}
                    />
                  </label>
                </div>

                {profileLoadMessage ? <p className="draft-message">{profileLoadMessage}</p> : null}
                {profileActionMessage ? <p className="draft-message">{profileActionMessage}</p> : null}
                {tableMessage ? <p className="table-message">{tableMessage}</p> : null}
                {localImportProfiles.length > 0 ? (
                  <div className="empty-state compact-empty-state">
                    <p>Найдены локальные профили.</p>
                    <span>Можно импортировать {localImportProfiles.length} записей в базу данных. Локальная копия не будет удалена.</span>
                    <button
                      className="primary-command"
                      disabled={isImportingProfiles}
                      onClick={importLocalProfiles}
                      type="button"
                    >
                      {isImportingProfiles ? "Импорт..." : "Импортировать в базу данных"}
                    </button>
                  </div>
                ) : null}

                <div className="profile-list">
                  {!isStorageReady || isProfileLoading ? (
                    <div className="empty-state">
                      <p>Загрузка профилей из базы данных...</p>
                    </div>
                  ) : paginatedProfiles.items.length > 0 ? (
                    paginatedProfiles.items.map((profile) => {
                      const computedTaskMark = getComputedTaskMark(profile.id, tasks, groups);
                      const isInActiveGroup = activeGroupMemberIds.has(profile.id);
                      const activeViolationCount = activeViolationCountByProfileId.get(profile.id) ?? 0;
                      const serviceBadges = getProfileServiceBadges({
                        activeViolationCount,
                        computedTaskMark,
                        isInActiveGroup,
                      });
                      return (
                        <button
                          className={`profile-list-item ${profile.id === selectedProfileId ? "profile-list-item-active" : ""}`}
                          key={profile.id}
                          onClick={() => selectProfile(profile.id)}
                          type="button"
                        >
                          <span className="profile-list-item-head">
                            <strong className="profile-list-name">{getProfileTitle(profile)}</strong>
                            <span className={`profile-affiliation-badge badge-chip ${getAffiliationBadgeClass(profile.affiliation)}`}>
                              {getAffiliationLabel(profile.affiliation)}
                            </span>
                          </span>

                          <span className="profile-list-info-row">
                            <span className="profile-list-meta">{profile.fullName || profile.callsign || "Без имени"}</span>
                            <span className="profile-list-badges">
                              {serviceBadges.map((badge) => (
                                <span className={`profile-state-badge badge-chip ${badge.className}`} key={badge.className}>
                                  {badge.label}
                                </span>
                              ))}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="empty-state">
                      <p>{profileListTab === "active" ? "Активные профили не найдены." : "Архив пуст."}</p>
                    </div>
                  )}
                </div>

                {isStorageReady && !isProfileLoading ? (
                  <Pagination page={paginatedProfiles.page} pageCount={paginatedProfiles.pageCount} onPageChange={setProfilePage} />
                ) : null}
              </section>

              <section className="profile-column detail-host-column">
                {!isStorageReady || isProfileLoading ? (
                  <div className="empty-state">
                    <p>Загрузка профилей из базы данных...</p>
                  </div>
                ) : selectedProfile ? (
                  <div className="profile-detail">
                    <div className="profile-hero">
                      <div
                        aria-label={selectedProfile.registryNumber ? `Внутренний номер: ${selectedProfile.registryNumber}` : undefined}
                        className="profile-hero-photo"
                        tabIndex={selectedProfile.registryNumber ? 0 : undefined}
                      >
                        {selectedProfile.photoUrl && !profilePhotoLoadFailed ? (
                          <img
                            alt="Фотография профиля сталкера"
                            onError={() => setProfilePhotoLoadFailed(true)}
                            src={selectedProfile.photoUrl}
                          />
                        ) : (
                          <img
                            alt="Стоковое изображение профиля сталкера"
                            className="profile-photo-placeholder"
                            src="/no-data-person.png"
                          />
                        )}
                        {selectedProfile.registryNumber ? (
                          <div className="profile-photo-overlay" aria-hidden="true">
                            <span>Внутренний номер</span>
                            <strong>{selectedProfile.registryNumber}</strong>
                          </div>
                        ) : null}
                      </div>

                      <div className="profile-hero-main">
                        <div className="profile-hero-head">
                          <div className="profile-hero-badges">
                            <span className={`profile-badge badge-chip ${getAffiliationBadgeClass(selectedProfile.affiliation)}`}>
                              {getAffiliationLabel(selectedProfile.affiliation)}
                            </span>
                            {selectedProfile.status === "archive" ? (
                              <span className={`profile-badge badge-chip ${getProfileStateBadgeClass("archive")}`}>Архив</span>
                            ) : null}
                            {activeGroupMemberIds.has(selectedProfile.id) ? (
                              <span className="profile-badge badge-chip badge-service-group">В группе</span>
                            ) : null}
                            {selectedTaskMark === "active" ? (
                              <span className="profile-badge badge-chip badge-service-task-active">Активное задание</span>
                            ) : null}
                            {selectedTaskMark === "overdue" ? (
                              <span className="profile-badge badge-chip badge-service-task-overdue">Просроченное задание</span>
                            ) : null}
                            {selectedProfileActiveViolationCount > 0 ? (
                              <span className="profile-badge badge-chip badge-service-violation-active">
                                {selectedProfileActiveViolationCount > 1
                                  ? `Активных нарушений: ${selectedProfileActiveViolationCount}`
                                  : "Активное нарушение"}
                              </span>
                            ) : null}
                          </div>

                          <div className="profile-hero-identity">
                            <h1 className="profile-hero-title">{getProfileTitle(selectedProfile)}</h1>
                            <p className="profile-hero-subtitle">{getProfileMetaLine(selectedProfile)}</p>
                          </div>
                        </div>

                        <div className="profile-hero-notes">
                          <section className="profile-hero-note">
                            <span>Особенности внешности</span>
                            <p>{selectedProfile.appearance || "Не указаны."}</p>
                          </section>
                          <section className="profile-hero-note">
                            <span>Заметки</span>
                            <p>{selectedProfile.notes || "Заметок нет."}</p>
                          </section>
                        </div>
                      </div>

                      <div className="profile-hero-actions">
                        <button className="command-row task-action-button" disabled={isProfileSaving || isProfileDeleting} onClick={() => openEditProfile(selectedProfile)} type="button">
                          Редактировать
                        </button>
                        {selectedProfile.status === "active" ? (
                          <button className="command-row task-action-button" disabled={isProfileSaving || isProfileDeleting} onClick={() => setProfileStatus(selectedProfile.id, "archive")} type="button">
                            В архив
                          </button>
                        ) : (
                          <button className="command-row task-action-button" disabled={isProfileSaving || isProfileDeleting} onClick={() => setProfileStatus(selectedProfile.id, "active")} type="button">
                            Вернуть из архива
                          </button>
                        )}
                        <button className="command-row task-action-button" disabled={isProfileSaving || isProfileDeleting} onClick={() => deleteProfile(selectedProfile.id)} type="button">
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="dossier-context-strip">
                        <section className="dossier-context-cell dossier-context-cell-group">
                          <div className="dossier-cell-heading">
                            <span>Группа</span>
                            {selectedProfileGroups.length === 0 ? (
                              <button className="command-row task-action-button" onClick={openProfileGroupModal} type="button">
                                Добавить в группу
                              </button>
                            ) : null}
                          </div>
                          {selectedProfileGroups.length > 0 ? (
                            <div className="dossier-group-list">
                              {selectedProfileGroups.map(({ group, member }) => (
                                <div
                                  className="dossier-group-card dossier-group-card-clickable"
                                  key={group.id}
                                  onClick={openGroupsPage}
                                  onKeyDown={handleGroupCardKeyDown}
                                  role="button"
                                  tabIndex={0}
                                  title="Открыть раздел групп"
                                >
                                  <div className="dossier-group-main">
                                    <div className="dossier-group-avatar">
                                      <img
                                        alt="Аватар группы"
                                        src={group.photoUrl || "/no-data-group.png"}
                                      />
                                    </div>
                                    <div className="dossier-group-copy">
                                      <strong>{group.name}</strong>
                                      <span>
                                        Роль: {getGroupRoleLabel(member.roleType, member.customRoleName)}
                                      </span>
                                      <span>
                                        Участников: {group.members.length}
                                        {group.status === "archive" ? " · Архив" : ""}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-state compact-empty-state dossier-empty">
                              <p>Сталкер не состоит в активной группе.</p>
                              <span>Можно добавить его в существующую группу через кнопку выше.</span>
                            </div>
                          )}
                        </section>

                        <section className="dossier-context-cell dossier-context-cell-meta">
                          <div className="dossier-cell-heading">
                            <span>Служебные отметки</span>
                          </div>
                          <div className="dossier-service-grid">
                            <div title={`Кто внёс профиль: ${getProfileCreatedBy(selectedProfile)}`}>
                              <span>Когда внесли профиль</span>
                              <p>{formatDate(selectedProfile.createdAt)}</p>
                            </div>
                            <div title={`Кто отредактировал профиль: ${getProfileUpdatedBy(selectedProfile)}`}>
                              <span>Дата последнего редактирования</span>
                              <p>{formatDate(selectedProfile.updatedAt)}</p>
                            </div>
                          </div>
                        </section>
                    </div>

                    <section className="dossier-records-area">
                        <div className="dossier-records-toolbar">
                        <div className="profile-section-tabs">
                          {profileTabs.map((tab) => (
                            <button
                              className={`profile-section-tab ${tab === activeProfileTab ? "profile-section-tab-active" : ""}`}
                              key={tab}
                              onClick={() => setActiveProfileTab(tab)}
                              type="button"
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        <div className="dossier-records-actions">{renderProfileRecordAction()}</div>
                        </div>

                        {!activeProfileTab ? (
                          <div className="empty-state dossier-records-empty">
                            <p>Выберите раздел записей.</p>
                            <span>Откройте задания, продажи, покупки или нарушения этого профиля.</span>
                          </div>
                        ) : activeProfileTab === "Задания" ? (
                          <div className="task-section">
                            {taskMessage ? <p className="table-message">{taskMessage}</p> : null}

                            <div className="task-list">
                              {selectedProfileTasks.length > 0 ? (
                                selectedProfileTasks.map((task) => {
                                  const taskActions = getTaskActionVisibility(task);

                                  return (
                                    <TaskRecordCard
                                      actions={
                                        <>
                                          {taskActions.canEdit ? (
                                            <button className="command-row task-action-button" onClick={() => openEditTask(task)} type="button">
                                              Редактировать
                                            </button>
                                          ) : null}
                                          {taskActions.canComplete ? (
                                            <button className="command-row task-action-button" onClick={() => openCompleteTask(task)} type="button">
                                              Засчитать
                                            </button>
                                          ) : null}
                                          {taskActions.canCancel ? (
                                            <button className="command-row task-action-button" onClick={() => cancelTask(task.id)} type="button">
                                              Отменить
                                            </button>
                                          ) : null}
                                          {taskActions.canDelete ? (
                                            <button className="command-row task-action-button" onClick={() => deleteTask(task.id)} type="button">
                                              Удалить
                                            </button>
                                          ) : null}
                                        </>
                                      }
                                      assigneeLabel={getTaskAssigneeLabel(task)}
                                      formatDate={formatDate}
                                      key={task.id}
                                      statusClassName={getTaskStatusClass(task)}
                                      statusLabel={getTaskStatusLabel(task)}
                                      task={task}
                                    />
                                  );
                                })
                              ) : (
                                <div className="empty-state">
                                  <p>Заданий пока нет.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : activeProfileTab === "Продажи" ? (
                          renderProfileTradeRecords("sale")
                        ) : activeProfileTab === "Покупки" ? (
                          renderProfileTradeRecords("purchase")
                        ) : activeProfileTab === "Нарушения" ? (
                          renderProfileViolations()
                        ) : (
                          <div className="empty-state">
                            <p>{getEmptySectionMessage(activeProfileTab)}</p>
                          </div>
                        )}
                    </section>
                  </div>
                ) : (
                  <div className="empty-state profile-detail-empty">
                    <p>Выберите профиль сталкера.</p>
                    <span>Откроется карточка с данными, группой, заданиями, торговыми операциями и нарушениями.</span>
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      </section>

      {isProfileModalOpen ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal" onSubmit={handleProfileSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{editingProfileId ? "Редактирование профиля" : "Создание профиля сталкера"}</h1>
                <p>Профиль сохраняется в базе данных</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Основные данные</h2>
                  <span>Для создания достаточно ФИО или позывного</span>
                </div>
                <div className="modal-layout-grid">
                  <div className="profile-create-grid">
                    <label className="filter-field">
                      <span>ФИО</span>
                      <input onChange={(event) => updateDraft("fullName", event.target.value)} placeholder="Например: Чередняк Савелий Алексеевич" type="text" value={draft.fullName} />
                    </label>
                    <label className="filter-field">
                      <span>Позывной</span>
                      <input onChange={(event) => updateDraft("callsign", event.target.value)} placeholder="Например: Шрам" type="text" value={draft.callsign} />
                    </label>
                    <label className="filter-field">
                      <span>Внутренний номер</span>
                      <input onChange={(event) => updateDraft("registryNumber", event.target.value)} placeholder="Например: 200999" type="text" value={draft.registryNumber} />
                    </label>
                    <label className="filter-field">
                      <span>Дата рождения</span>
                      <input onChange={(event) => updateDraft("birthDate", event.target.value)} type="date" value={draft.birthDate} />
                    </label>
                    <label className="filter-field">
                      <span>Принадлежность</span>
                      <select onChange={(event) => updateDraft("affiliation", event.target.value)} value={draft.affiliation}>
                        <option value="">Не указана</option>
                        {Object.entries(affiliationLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="filter-field">
                      <span>Статус профиля</span>
                      <select onChange={(event) => updateDraft("status", event.target.value as StalkerProfile["status"])} value={draft.status}>
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="filter-field profile-create-wide">
                      <span>Фотография</span>
                      <input onChange={(event) => updateDraft("photoUrl", event.target.value)} placeholder="Например: https://..." type="url" value={draft.photoUrl} />
                    </label>
                  </div>

                  <div className="profile-photo-preview">
                    <span className="profile-photo-title">Фото профиля</span>
                    <div className="profile-photo-frame">
                      {normalizedPhotoUrl && !photoLoadFailed ? (
                        <img alt="Предпросмотр фотографии профиля" onError={() => setPhotoLoadFailed(true)} src={normalizedPhotoUrl} />
                      ) : (
                        <span>{photoLoadFailed ? "Не удалось загрузить изображение" : "Фото не указано"}</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Описание и заметки</h2>
                  <span>Внешность, признаки и рабочие комментарии</span>
                </div>
                <div className="profile-create-grid">
                  <label className="filter-field profile-create-wide">
                    <span>Особенности внешности</span>
                    <textarea onChange={(event) => updateDraft("appearance", event.target.value)} placeholder="Рост, телосложение, шрамы, экипировка, заметные особенности" value={draft.appearance} />
                  </label>
                  <label className="filter-field profile-create-wide">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Дополнительные сведения, история взаимодействий, предупреждения" value={draft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {formMessage ? <p className="draft-message">{formMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeProfileModal} type="button">
                Отмена
              </button>
              <button className="primary-command" disabled={isProfileSaving} type="submit">
                {isProfileSaving ? "Сохранение..." : editingProfileId ? "Сохранить изменения" : "Сохранить профиль"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isProfileGroupModalOpen && selectedProfile ? (
        <div className="pda-modal-backdrop">
          <div className="pda-modal task-modal">
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Добавить в группу</h1>
                <p>Профиль: {getProfileTitle(selectedProfile)}</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Поиск группы</h2>
                </div>
                {activeGroups.length > 0 ? (
                  <>
                    <div className="group-search-controls">
                      <label className="filter-field">
                        <span>Название группы</span>
                        <input
                          onChange={(event) => setGroupMemberDraft((currentDraft) => ({ ...currentDraft, groupSearchQuery: event.target.value }))}
                          onKeyDown={handleGroupSearchKeyDown}
                          placeholder="Название группы"
                          type="text"
                          value={groupMemberDraft.groupSearchQuery}
                        />
                      </label>
                      <button className="command-row task-action-button" onClick={applyGroupSearch} type="button">
                        Найти
                      </button>
                    </div>
                    <div className="group-search-results">
                      {!appliedGroupSearchQuery ? (
                        <div className="empty-state compact-empty-state">
                          <p>Введите название группы и нажмите Enter.</p>
                        </div>
                      ) : profileGroupSearchResults.length > 0 ? (
                        profileGroupSearchResults.map((group) => (
                          <div className="group-search-result" key={group.id}>
                            <div>
                              <strong>{group.name}</strong>
                              <span>Участников: {group.members.length}</span>
                            </div>
                            <button className="command-row task-action-button" onClick={() => addProfileToGroup(group.id)} type="button">
                              Добавить
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state compact-empty-state">
                          <p>Группы не найдены.</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <p>Активные группы не найдены. Создайте группу в разделе групп.</p>
                  </div>
                )}
              </section>

              {activeGroups.length > 0 ? (
                <section className="form-section">
                  <div className="form-section-heading">
                    <h2>Роль в группе</h2>
                  </div>
                  <div className="group-role-fields profile-group-role-fields">
                    <select
                      className="group-role-select"
                      onChange={(event) => setGroupMemberDraft((currentDraft) => ({ ...currentDraft, roleType: event.target.value as StalkerGroupRoleType }))}
                      value={groupMemberDraft.roleType}
                    >
                      {Object.entries(groupRoleLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {groupMemberDraft.roleType === "custom" ? (
                      <input
                        className="group-role-input"
                        onChange={(event) => setGroupMemberDraft((currentDraft) => ({ ...currentDraft, customRoleName: event.target.value }))}
                        placeholder="Название роли"
                        type="text"
                        value={groupMemberDraft.customRoleName}
                      />
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="modal-message-slot">
              {profileGroupMessage ? <p className="draft-message">{profileGroupMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeProfileGroupModal} type="button">
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingTaskId ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal" onSubmit={handleEditTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Редактирование задания</h1>
                <p>Изменения сохраняются локально в браузере</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Параметры задания</h2>
                  <span>Сроки, награда и ответственный</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Дата выдачи</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateEditTaskDraft("issuedAt", event.target.value)} type="date" value={editTaskDraft.issuedAt} />
                  </label>
                  <label className="filter-field">
                    <span>Выполнить до</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateEditTaskDraft("dueAt", event.target.value)} type="date" value={editTaskDraft.dueAt} />
                  </label>
                  <label className="filter-field">
                    <span>Награда</span>
                    <input onChange={(event) => updateEditTaskDraft("reward", event.target.value)} placeholder="Например: 5000 рублей или аптечка" type="text" value={editTaskDraft.reward} />
                  </label>
                  <label className="filter-field">
                    <span>Кто выдал</span>
                    <input onChange={(event) => updateEditTaskDraft("issuedBy", event.target.value)} placeholder="Позывной или должность члена Долга" type="text" value={editTaskDraft.issuedBy} />
                  </label>
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
                    <textarea onChange={(event) => updateEditTaskDraft("description", event.target.value)} placeholder="Опишите задачу, условия выполнения и ожидаемый результат" value={editTaskDraft.description} />
                  </label>
                  <label className="filter-field task-form-wide">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateEditTaskDraft("notes", event.target.value)} placeholder="Дополнительные условия, предупреждения, комментарии" value={editTaskDraft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {editTaskMessage ? <p className="draft-message">{editTaskMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeEditTaskDialog} type="button">
                Отмена
              </button>
              <button className="primary-command" type="submit">
                Сохранить изменения
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {completingTaskId ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal task-complete-modal" onSubmit={handleCompleteTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Засчитать выполнение задания</h1>
                <p>Статус выполнения сохранится локально после подтверждения</p>
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
                    <input onChange={(event) => setCompleteTaskDraft({ acceptedBy: event.target.value })} placeholder="Позывной или должность члена Долга" type="text" value={completeTaskDraft.acceptedBy} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {completeTaskMessage ? <p className="draft-message">{completeTaskMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeCompleteTaskDialog} type="button">
                Отмена
              </button>
              <button className="primary-command" type="submit">
                Засчитать
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isTaskOpen && selectedProfile ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal" onSubmit={handleTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Выдача задания</h1>
                <p>Получатель: {getProfileTitle(selectedProfile)}</p>
              </div>
            </div>

            <div className="modal-body">
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
                    <input onChange={(event) => updateTaskDraft("reward", event.target.value)} placeholder="Например: 5000 рублей или аптечка" type="text" value={taskDraft.reward} />
                  </label>
                  <label className="filter-field">
                    <span>Кто выдал</span>
                    <input onChange={(event) => updateTaskDraft("issuedBy", event.target.value)} placeholder="Позывной или должность члена Долга" type="text" value={taskDraft.issuedBy} />
                  </label>
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
                    <textarea onChange={(event) => updateTaskDraft("description", event.target.value)} placeholder="Опишите задачу, условия выполнения и ожидаемый результат" value={taskDraft.description} />
                  </label>
                  <label className="filter-field task-form-wide">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateTaskDraft("notes", event.target.value)} placeholder="Дополнительные условия, предупреждения, комментарии" value={taskDraft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {taskFormMessage ? <p className="draft-message">{taskFormMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeTaskDialog} type="button">
                Отмена
              </button>
              <button className="primary-command" type="submit">
                Сохранить задание
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {tradeModalType && selectedProfile ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal" onSubmit={handleTradeSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>
                  {editingTradeId
                    ? tradeModalType === "sale"
                      ? "Редактирование продажи"
                      : "Редактирование покупки"
                    : tradeModalType === "sale"
                      ? "Оформление продажи"
                      : "Оформление покупки"}
                </h1>
                <p>
                  {tradeModalType === "sale"
                    ? `Покупатель: ${getProfileTitle(selectedProfile)}`
                    : `Продавец: ${getProfileTitle(selectedProfile)}`}
                </p>
              </div>
            </div>

            <div className="modal-body">
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
                    <span>Цена</span>
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
              <button className="primary-command" type="submit">
                {editingTradeId
                  ? "Сохранить изменения"
                  : tradeModalType === "sale"
                    ? "Сохранить продажу"
                    : "Сохранить покупку"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isViolationModalOpen && selectedProfile ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal" onSubmit={handleViolationSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{editingViolationId ? "Редактирование нарушения" : "Оформление нарушения"}</h1>
                <p>Нарушитель: {getProfileTitle(selectedProfile)}</p>
              </div>
            </div>

            <div className="modal-body">
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
              <button className="primary-command" type="submit">
                {editingViolationId ? "Сохранить изменения" : "Сохранить нарушение"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {closingViolationId ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-complete-modal" onSubmit={closeViolationRecord}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Закрыть нарушение</h1>
                <p>
                  {
                    violations.find((violation) => violation.id === closingViolationId)?.description ??
                    "Нарушение"
                  }
                </p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Подтверждение</h2>
                  <span>Нарушение останется в истории, но перейдёт в погашенные</span>
                </div>
                <label className="filter-field">
                  <span>Что сталкер сделал для закрытия нарушения</span>
                  <textarea
                    onChange={(event) => {
                      setViolationClosureNote(event.target.value);
                      setViolationClosureMessage("");
                    }}
                    placeholder="Опишите действия сталкера для закрытия нарушения"
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
              <button className="primary-command" type="submit">
                Закрыть нарушение
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
