"use client";

/* eslint-disable @next/next/no-img-element */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { ActionAuthorLine } from "@/components/ui/ActionAuthorLine";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { getTaskActionVisibility, TaskRecordCard } from "@/components/ui/TaskRecordCard";
import { TradeRecordCard } from "@/components/ui/TradeRecordCard";
import { ViolationRecordCard } from "@/components/ui/ViolationRecordCard";
import { addActivityLogEntry } from "@/lib/activity-log";
import { apiFetch, apiFetchJson } from "@/lib/api-client";
import { dutyDataKeys, scheduleClientStateSync, useCurrentUserCacheKey, useDutyQueryClient } from "@/lib/data-cache";
import {
  createTask,
  createTradeOperation,
  createViolation,
  deleteTaskRecord,
  deleteTradeOperationRecord,
  deleteViolationRecord as deleteViolationRecordRequest,
  fetchTasks,
  fetchTradeOperations,
  fetchViolations,
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
  getProfileSecondaryTitle,
  getProfileTitle,
  getSystemTimestamp,
  getSystemToday,
  getTodayDate,
  groupRoleLabels,
  isTaskOverdue,
  matchesStalkerProfileSearch,
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

type StalkerGroupApiResponse = {
  id: string;
  name: string;
  photoUrl: string | null;
  status: StalkerGroup["status"];
  notes: string | null;
  members: StalkerGroup["members"];
  createdAt: string;
  updatedAt: string;
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

function normalizeApiGroup(group: StalkerGroupApiResponse): StalkerGroup {
  return {
    id: group.id,
    name: group.name,
    photoUrl: group.photoUrl ?? undefined,
    status: group.status,
    notes: group.notes ?? "",
    members: group.members,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

async function fetchStalkerProfiles() {
  const payload = await apiFetchJson<StalkerProfileApiResponse[]>("/api/stalkers", { cache: "no-store" });
  return payload.map(normalizeApiProfile);
}

async function fetchStalkerGroups() {
  const payload = await apiFetchJson<StalkerGroupApiResponse[]>("/api/stalker-groups", { cache: "no-store" });
  return payload.map(normalizeApiGroup);
}

async function saveStalkerProfileRequest(
  method: "POST" | "PATCH",
  url: string,
  payload: Record<string, unknown>,
) {
  const responsePayload = await apiFetchJson<StalkerProfileApiResponse>(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return normalizeApiProfile(responsePayload);
}

async function saveStalkerGroupRequest(
  url: string,
  payload: Record<string, unknown>,
  fallbackMessage: string,
) {
  const responsePayload = await apiFetchJson<StalkerGroupApiResponse>(
    url,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return normalizeApiGroup(responsePayload);
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

function isDirtyValue(currentValue: unknown, initialValue: unknown) {
  return JSON.stringify(currentValue) !== JSON.stringify(initialValue);
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
  const queryClient = useDutyQueryClient();
  const { currentUser, currentUserKey, isCurrentUserLoading } = useCurrentUserCacheKey();
  const [profiles, setProfiles] = useState<StalkerProfile[]>(() =>
    currentUserKey ? (queryClient.getQueryData<StalkerProfile[]>(dutyDataKeys.stalkers(currentUserKey)) ?? []) : [],
  );
  const [tasks, setTasks] = useState<Task[]>(() =>
    currentUserKey ? (queryClient.getQueryData<Task[]>(dutyDataKeys.tasks(currentUserKey)) ?? []) : [],
  );
  const [groups, setGroups] = useState<StalkerGroup[]>(() =>
    currentUserKey ? (queryClient.getQueryData<StalkerGroup[]>(dutyDataKeys.stalkerGroups(currentUserKey)) ?? []) : [],
  );
  const [tradeOperations, setTradeOperations] = useState<TradeOperation[]>(() =>
    currentUserKey ? (queryClient.getQueryData<TradeOperation[]>(dutyDataKeys.tradeOperations(currentUserKey)) ?? []) : [],
  );
  const [violations, setViolations] = useState<Violation[]>(() =>
    currentUserKey ? (queryClient.getQueryData<Violation[]>(dutyDataKeys.violations(currentUserKey)) ?? []) : [],
  );
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
  const [currentUserLabel, setCurrentUserLabel] = useState("текущий пользователь");
  const [profileGroupMessage, setProfileGroupMessage] = useState("");
  const [tableMessage, setTableMessage] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [tradeMessage, setTradeMessage] = useState("");
  const [violationMessage, setViolationMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    variant?: "danger" | "default" | "warning";
    loading?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupMemberDraft, setGroupMemberDraft] = useState(emptyGroupMemberDraft);
  const [appliedGroupSearchQuery, setAppliedGroupSearchQuery] = useState<string | null>(null);
  const [profilePage, setProfilePage] = useState(1);

  const profilesQuery = useQuery({
    queryKey: dutyDataKeys.stalkers(currentUserKey ?? "pending"),
    queryFn: fetchStalkerProfiles,
    enabled: Boolean(currentUserKey),
  });
  const groupsQuery = useQuery({
    queryKey: dutyDataKeys.stalkerGroups(currentUserKey ?? "pending"),
    queryFn: fetchStalkerGroups,
    enabled: Boolean(currentUserKey),
  });
  const tasksQuery = useQuery({
    queryKey: dutyDataKeys.tasks(currentUserKey ?? "pending"),
    queryFn: fetchTasks,
    enabled: Boolean(currentUserKey),
  });
  const tradeOperationsQuery = useQuery({
    queryKey: dutyDataKeys.tradeOperations(currentUserKey ?? "pending"),
    queryFn: fetchTradeOperations,
    enabled: Boolean(currentUserKey),
  });
  const violationsQuery = useQuery({
    queryKey: dutyDataKeys.violations(currentUserKey ?? "pending"),
    queryFn: fetchViolations,
    enabled: Boolean(currentUserKey),
  });

  useEffect(() => {
    const storageReadHandle = window.setTimeout(() => {
      const localProfiles = readStoredCollection<StalkerProfile>(STALKER_PROFILES_STORAGE_KEY, initialStalkerProfiles);
      const localTasks = readStoredCollection<Task>(STALKER_TASKS_STORAGE_KEY, initialTasks);
      const localGroups = readStoredCollection<StalkerGroup>(STALKER_GROUPS_STORAGE_KEY, initialStalkerGroups);
      const localTradeOperations = readStoredCollection<TradeOperation>(TRADE_OPERATIONS_STORAGE_KEY, initialTradeOperations);
      const localViolations = readStoredCollection<Violation>(VIOLATIONS_STORAGE_KEY, []);
      const cachedProfiles = currentUserKey ? queryClient.getQueryData<StalkerProfile[]>(dutyDataKeys.stalkers(currentUserKey)) : null;
      const cachedGroups = currentUserKey ? queryClient.getQueryData<StalkerGroup[]>(dutyDataKeys.stalkerGroups(currentUserKey)) : null;
      const cachedTasks = currentUserKey ? queryClient.getQueryData<Task[]>(dutyDataKeys.tasks(currentUserKey)) : null;
      const cachedTradeOperations = currentUserKey
        ? queryClient.getQueryData<TradeOperation[]>(dutyDataKeys.tradeOperations(currentUserKey))
        : null;
      const cachedViolations = currentUserKey ? queryClient.getQueryData<Violation[]>(dutyDataKeys.violations(currentUserKey)) : null;

      setProfiles(cachedProfiles ?? localProfiles);
      setGroups(cachedGroups ?? localGroups);
      setTasks(cachedTasks ?? localTasks);
      setTradeOperations(cachedTradeOperations ?? localTradeOperations);
      setViolations(cachedViolations ?? localViolations);
      setIsStorageReady(true);
      setIsProfileLoading(!cachedProfiles && !profilesQuery.data);

      if (!cachedProfiles && localProfiles.length > 0) {
        setLocalImportProfiles(localProfiles);
      }
    }, 0);

    return () => {
      window.clearTimeout(storageReadHandle);
    };
  }, [currentUserKey, profilesQuery.data, queryClient]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      setCurrentUserLabel(currentUser?.displayName?.trim() || currentUser?.login?.trim() || "текущий пользователь");
    });
  }, [currentUser]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (profilesQuery.data) {
        const queryProfileId = new URLSearchParams(window.location.search).get("profileId");
        setProfiles(profilesQuery.data);
        setLocalImportProfiles((currentLocalProfiles) => (profilesQuery.data.length > 0 ? [] : currentLocalProfiles));

        const profileFromQuery = queryProfileId ? profilesQuery.data.find((profile) => profile.id === queryProfileId) : null;

        if (profileFromQuery) {
          setSelectedProfileId(profileFromQuery.id);
          setProfileListTab(profileFromQuery.status);
          setActiveProfileTab("");
          setProfilePhotoLoadFailed(false);
        }
      }
    });
  }, [profilesQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (groupsQuery.data) {
        setGroups(groupsQuery.data);
      }
    });
  }, [groupsQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (tasksQuery.data) {
        setTasks(tasksQuery.data);
      }
    });
  }, [tasksQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (tradeOperationsQuery.data) {
        setTradeOperations(tradeOperationsQuery.data);
      }
    });
  }, [tradeOperationsQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (violationsQuery.data) {
        setViolations(violationsQuery.data);
      }
    });
  }, [violationsQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      const hasLoadError = [profilesQuery, groupsQuery, tasksQuery, tradeOperationsQuery, violationsQuery].some((query) => query.isError);
      setProfileLoadMessage(hasLoadError ? "Не удалось загрузить профили." : "");
      setIsProfileLoading(
        isCurrentUserLoading ||
          ([profilesQuery, groupsQuery, tasksQuery, tradeOperationsQuery, violationsQuery].some((query) => query.isPending) && profiles.length === 0),
      );
    });
  }, [groupsQuery, isCurrentUserLoading, profiles.length, profilesQuery, tasksQuery, tradeOperationsQuery, violationsQuery]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    if (profiles.length === 0 && localImportProfiles.length > 0) {
      return;
    }

    writeStoredCollection(STALKER_PROFILES_STORAGE_KEY, profiles);
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.stalkers(currentUserKey), profiles);
    }
  }, [currentUserKey, isStorageReady, localImportProfiles.length, profiles, queryClient]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(STALKER_TASKS_STORAGE_KEY, tasks);
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.tasks(currentUserKey), tasks);
    }
  }, [currentUserKey, isStorageReady, queryClient, tasks]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(STALKER_GROUPS_STORAGE_KEY, groups);
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.stalkerGroups(currentUserKey), groups);
    }
  }, [currentUserKey, groups, isStorageReady, queryClient]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(TRADE_OPERATIONS_STORAGE_KEY, tradeOperations);
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.tradeOperations(currentUserKey), tradeOperations);
    }
  }, [currentUserKey, isStorageReady, queryClient, tradeOperations]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(VIOLATIONS_STORAGE_KEY, violations);
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.violations(currentUserKey), violations);
    }
  }, [currentUserKey, isStorageReady, queryClient, violations]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId),
    [profiles, selectedProfileId],
  );

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
    return profiles
      .filter((profile) => profile.status === profileListTab)
      .filter((profile) => matchesStalkerProfileSearch(profile, searchQuery));
  }, [profileListTab, profiles, searchQuery]);

  const paginatedProfiles = useMemo(
    () => getPaginatedItems(visibleProfiles, profilePage),
    [profilePage, visibleProfiles],
  );
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

  function requestDirtyModalClose(isDirty: boolean, closeModal: () => void) {
    if (!isDirty) {
      closeModal();
      return;
    }

    setConfirmDialog({
      title: "Закрыть окно?",
      message: "Вы уверены, что хотите закрыть окно?",
      confirmLabel: "Закрыть",
      cancelLabel: "Остаться",
      variant: "warning",
      onConfirm: () => {
        setConfirmDialog(null);
        closeModal();
      },
    });
  }

  function handleModalBackdropMouseDown(
    event: React.MouseEvent<HTMLElement>,
    isDirty: boolean,
    closeModal: () => void,
  ) {
    if (event.target === event.currentTarget) {
      requestDirtyModalClose(isDirty, closeModal);
    }
  }

  function getInitialProfileDraft() {
    const profile = editingProfileId ? profiles.find((currentProfile) => currentProfile.id === editingProfileId) : null;

    if (!profile) {
      return emptyDraft;
    }

    return {
      fullName: profile.fullName,
      callsign: profile.callsign,
      registryNumber: profile.registryNumber ?? "",
      birthDate: normalizeDateInputValue(profile.birthDate),
      affiliation: profile.affiliation ?? "",
      photoUrl: profile.photoUrl ?? "",
      appearance: profile.appearance,
      notes: profile.notes,
      status: profile.status,
    };
  }

  function isProfileDraftDirty() {
    return isDirtyValue(draft, getInitialProfileDraft());
  }

  function isProfileGroupDraftDirty() {
    return isDirtyValue(groupMemberDraft, emptyGroupMemberDraft);
  }

  function isTaskDraftDirty() {
    return isDirtyValue(taskDraft, createEmptyTaskDraft());
  }

  function getInitialEditTaskDraft() {
    const task = editingTaskId ? tasks.find((currentTask) => currentTask.id === editingTaskId) : null;

    if (!task) {
      return createEmptyTaskDraft();
    }

    return {
      issuedAt: task.issuedAt,
      dueAt: task.dueAt,
      description: task.description,
      reward: task.reward,
      notes: task.notes,
      issuedBy: task.issuedBy,
    };
  }

  function isEditTaskDraftDirty() {
    return isDirtyValue(editTaskDraft, getInitialEditTaskDraft());
  }

  function isCompleteTaskDraftDirty() {
    return false;
  }

  function getInitialTradeDraft() {
    const operation = editingTradeId
      ? tradeOperations.find((currentOperation) => currentOperation.id === editingTradeId)
      : null;

    if (!operation) {
      return createEmptyTradeDraft(tradeModalType ?? "sale");
    }

    const firstItem = operation.items[0];

    return {
      type: operation.type,
      itemName: firstItem?.name ?? "",
      quantity: firstItem ? String(firstItem.quantity) : "1",
      price: firstItem ? String(firstItem.price) : "",
      issuedBy: operation.issuedBy,
      notes: operation.notes,
      operationDate: operation.operationDate ?? operation.createdAt.slice(0, 10),
    };
  }

  function isTradeDraftDirty() {
    return isDirtyValue(tradeDraft, getInitialTradeDraft());
  }

  function getInitialViolationDraft() {
    const violation = editingViolationId
      ? violations.find((currentViolation) => currentViolation.id === editingViolationId)
      : null;

    if (!violation) {
      return createEmptyViolationDraft();
    }

    return {
      date: violation.date,
      description: violation.description,
      issuedBy: violation.issuedBy,
      notes: violation.notes,
    };
  }

  function isViolationDraftDirty() {
    return isDirtyValue(violationDraft, getInitialViolationDraft());
  }

  function isViolationClosureDirty() {
    return violationClosureNote.trim().length > 0;
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

  async function addProfileToGroup(groupId: string) {
    if (!selectedProfile) {
      return;
    }

    if (!groupId) {
      setProfileGroupMessage("Выберите группу.");
      return;
    }

    const group = groups.find((currentGroup) => currentGroup.id === groupId);

    if (!group) {
      setProfileGroupMessage("Не удалось обновить состав группы.");
      return;
    }

    if (group.members.some((member) => member.stalkerId === selectedProfile.id)) {
      setProfileGroupMessage("Профиль уже состоит в этой группе.");
      return;
    }

    const customRoleName = groupMemberDraft.customRoleName.trim();

    if (groupMemberDraft.roleType === "custom" && !customRoleName) {
      setProfileGroupMessage("Укажите название роли.");
      return;
    }

    const now = getSystemTimestamp();
    const nextMembers = [
      ...group.members,
      {
        id: `member-${selectedProfile.id}-${now}`,
        stalkerId: selectedProfile.id,
        roleType: groupMemberDraft.roleType,
        customRoleName: groupMemberDraft.roleType === "custom" ? customRoleName : null,
        joinedAt: now,
      },
    ];

    setIsProfileSaving(true);
    setProfileGroupMessage("");

    try {
      const updatedGroup = await saveStalkerGroupRequest(
        `/api/stalker-groups/${encodeURIComponent(groupId)}`,
        {
          name: group.name,
          photoUrl: group.photoUrl ?? null,
          notes: group.notes,
          status: group.status,
          members: nextMembers,
        },
        "Не удалось обновить состав группы.",
      );

      setGroups((currentGroups) =>
        currentGroups.map((currentGroup) => (currentGroup.id === updatedGroup.id ? updatedGroup : currentGroup)),
      );
      closeProfileGroupModal();
      setTableMessage("Профиль добавлен в группу.");
      addActivityLogEntry({
        type: "group",
        title: `Сталкер добавлен в группу: ${group.name}`,
        status: "OK",
        description: getProfileTitle(selectedProfile),
      });
    } catch (error) {
      setProfileGroupMessage(error instanceof Error ? error.message : "Не удалось обновить состав группы.");
    } finally {
      setIsProfileSaving(false);
    }
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
    } catch {
      setFormMessage(
        "Не удалось сохранить профиль.",
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
    } catch {
      setProfileActionMessage(
        "Не удалось изменить статус профиля.",
      );
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function deleteProfile(profileId: string) {
    const profile = profiles.find((currentProfile) => currentProfile.id === profileId);

    setProfileActionMessage("");
    setIsProfileDeleting(true);

    try {
      await apiFetch(`/api/stalkers/${encodeURIComponent(profileId)}`, { method: "DELETE" }, "Не удалось удалить профиль.");

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
      setTableMessage("Профиль удалён. Связанные записи обновлены.");
      addActivityLogEntry({
        type: "stalker",
        title: `Профиль удалён: ${profile ? getProfileTitle(profile) : "Без имени"}`,
        status: "WARN",
      });
    } catch {
      setProfileActionMessage(
        "Не удалось удалить профиль.",
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
      const importedProfilePayload = await apiFetchJson<StalkerProfileApiResponse[]>("/api/stalkers/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(localImportProfiles),
      });
      const importedProfiles = importedProfilePayload.map(normalizeApiProfile);
      setProfiles(importedProfiles);
      writeStoredCollection(STALKER_PROFILES_STORAGE_KEY, importedProfiles);
      setLocalImportProfiles([]);
      setProfilePage(1);
      setTableMessage("Найденные записи профилей импортированы.");
    } catch {
      setProfileActionMessage(
        "Не удалось выполнить импорт профилей.",
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
    setCompleteTaskMessage("");
  }

  function closeCompleteTaskDialog() {
    setCompletingTaskId("");
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

  async function handleTaskSubmit(event: React.FormEvent<HTMLFormElement>) {
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

    const newTask = await createTask({
      assigneeType: "stalker",
      stalkerId: selectedProfile.id,
      groupId: null,
      issuedAt: taskDraft.issuedAt,
      dueAt: taskDraft.dueAt,
      description,
      reward: taskDraft.reward.trim(),
      notes: taskDraft.notes.trim(),
      completedAt: null,
      status: "active",
    }).catch(() => {
      setTaskFormMessage("Не удалось сохранить задание.");
      return null;
    });

    if (!newTask) {
      return;
    }

    setTasks((currentTasks) => [newTask, ...currentTasks]);
    closeTaskDialog();
    setTaskMessage("Задание сохранено в базе данных.");
    addActivityLogEntry({
      type: "task",
      title: `Выдано задание из профиля: ${description}`,
      status: "OK",
      description: `Получатель: ${getProfileTitle(selectedProfile)}`,
    });
  }

  async function handleTradeSubmit(event: React.FormEvent<HTMLFormElement>) {
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

    const item = {
      id: `profile-trade-item-${Date.now()}`,
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
      setTradeMessage(tradeDraft.type === "sale" ? "Продажа обновлена." : "Покупка обновлена.");
      setActiveProfileTab(tradeDraft.type === "sale" ? "Продажи" : "Покупки");
      closeTradeModal();
      return;
    }

    const newOperation = await createTradeOperation({
      type: tradeDraft.type,
      subjectType: "stalker",
      stalkerId: selectedProfile.id,
      groupId: null,
      items: [item],
      totalAmount: quantity * price,
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
    setTradeMessage(tradeDraft.type === "sale" ? "Продажа сохранена в базе данных." : "Покупка сохранена в базе данных.");
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

    setConfirmDialog({
      title: operation.type === "sale" ? "Удаление продажи" : "Удаление покупки",
      message: confirmMessage,
      confirmLabel: "Удалить",
      variant: "danger",
      onConfirm: async () => {
        await deleteTradeOperationRecord(operation.id);
        setTradeOperations((currentOperations) =>
          currentOperations.filter((currentOperation) => currentOperation.id !== operation.id),
        );
        setTradeMessage(operation.type === "sale" ? "Продажа удалена." : "Покупка удалена.");
        setConfirmDialog(null);
      },
    });
  }

  async function handleViolationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProfile) {
      return;
    }

    const description = violationDraft.description.trim();

    if (!description) {
      setViolationFormMessage("Опишите нарушение.");
      return;
    }

    if (editingViolationId) {
      const updatedViolation = await updateViolation(editingViolationId, {
        date: violationDraft.date,
        description,
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
      setViolationMessage("Нарушение обновлено.");
      setActiveProfileTab("Нарушения");
      closeViolationModal();
      return;
    }

    const newViolation = await createViolation({
      violatorType: "profile",
      profileId: selectedProfile.id,
      status: "active",
      date: violationDraft.date,
      description,
      notes: violationDraft.notes.trim(),
    }).catch(() => {
      setViolationFormMessage("Не удалось сохранить нарушение.");
      return null;
    });

    if (!newViolation) {
      return;
    }

    setViolations((currentViolations) => [newViolation, ...currentViolations]);
    setViolationMessage("Нарушение сохранено в базе данных.");
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
    setConfirmDialog({
      title: "Удаление нарушения",
      message: "Удалить запись о нарушении?",
      confirmLabel: "Удалить",
      variant: "danger",
      onConfirm: async () => {
        await deleteViolationRecordRequest(violationId);
        setViolations((currentViolations) => currentViolations.filter((violation) => violation.id !== violationId));
        setViolationMessage("Нарушение удалено.");
        setConfirmDialog(null);
      },
    });
  }

  async function closeViolationRecord(event: React.FormEvent<HTMLFormElement>) {
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

  async function handleEditTaskSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const description = editTaskDraft.description.trim();

    if (!description) {
      setEditTaskMessage("Опишите задание.");
      return;
    }

    const updatedTask = await updateTask(editingTaskId, {
      issuedAt: editTaskDraft.issuedAt,
      dueAt: editTaskDraft.dueAt,
      description,
      reward: editTaskDraft.reward.trim(),
      notes: editTaskDraft.notes.trim(),
    }).catch(() => {
      setEditTaskMessage("Не удалось сохранить задание.");
      return null;
    });

    if (!updatedTask) {
      return;
    }

    setTasks((currentTasks) => currentTasks.map((task) => (task.id === editingTaskId ? updatedTask : task)));
    closeEditTaskDialog();
    setTaskMessage("Задание обновлено.");
  }

  async function handleCompleteTaskSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const currentTask = tasks.find((task) => task.id === completingTaskId);
    const updatedTask = await updateTask(completingTaskId, {
      status: "completed",
      completedAt: currentTask?.completedAt || getTodayDate(),
    }).catch(() => {
      setCompleteTaskMessage("Не удалось засчитать задание.");
      return null;
    });

    if (!updatedTask) {
      return;
    }

    setTasks((currentTasks) => currentTasks.map((task) => (task.id === completingTaskId ? updatedTask : task)));
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

  async function cancelTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);

    if (!task || task.status !== "active") {
      return;
    }

    const updatedTask = await updateTask(taskId, { status: "cancelled" }).catch(() => {
      setTaskMessage("Не удалось отменить задание.");
      return null;
    });

    if (!updatedTask) {
      return;
    }

    setTasks((currentTasks) => currentTasks.map((currentTask) => (currentTask.id === taskId ? updatedTask : currentTask)));
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
    setConfirmDialog({
      title: "Удаление задания",
      message: "Удалить задание окончательно?",
      confirmLabel: "Удалить",
      variant: "danger",
      onConfirm: async () => {
        await deleteTaskRecord(taskId);
        setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
        setTaskMessage("Задание удалено.");
        setConfirmDialog(null);
      },
    });
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
                      placeholder="Поиск по номеру, позывному или ФИО"
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
                    <p>Найдены записи профилей для импорта.</p>
                    <span>Можно импортировать {localImportProfiles.length} записей в базу учёта. </span>
                    <button
                      className="primary-command"
                      disabled={isImportingProfiles}
                      onClick={importLocalProfiles}
                      type="button"
                    >
                      {isImportingProfiles ? "Импорт..." : "Импортировать записи"}
                    </button>
                  </div>
                ) : null}

                <div className="profile-list">
                  {!isStorageReady || isProfileLoading ? (
                    <div className="empty-state">
                      <p>Загрузка профилей...</p>
                    </div>
                  ) : paginatedProfiles.items.length > 0 ? (
                    paginatedProfiles.items.map((profile) => {
                      const computedTaskMark = getComputedTaskMark(profile.id, tasks, groups);
                      const isInActiveGroup = activeGroupMemberIds.has(profile.id);
                      const activeViolationCount = activeViolationCountByProfileId.get(profile.id) ?? 0;
                      const secondaryName = getProfileSecondaryTitle(profile);
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
                            {secondaryName ? <span className="profile-list-meta">{secondaryName}</span> : null}
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
                      <p>
                        {searchQuery.trim()
                          ? "По вашему запросу ничего не найдено."
                          : profileListTab === "active"
                            ? "Активные профили не найдены."
                            : "Архив пуст."}
                      </p>
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
                    <p>Загрузка профилей...</p>
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
                        <button
                          className="command-row task-action-button"
                          disabled={isProfileSaving || isProfileDeleting}
                          onClick={() =>
                            setConfirmDialog({
                              title: "Удаление профиля",
                              message: "Удалить профиль окончательно? Это действие нельзя отменить.",
                              confirmLabel: "Удалить",
                              variant: "danger",
                              loading: isProfileDeleting,
                              onConfirm: async () => {
                                await deleteProfile(selectedProfile.id);
                                setConfirmDialog(null);
                              },
                            })
                          }
                          type="button"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="dossier-context-strip">
                        <section className="dossier-context-cell dossier-context-cell-group">
                          <div className="dossier-cell-heading">
                            <span>Группа</span>
                            <button className="command-row task-action-button" onClick={openProfileGroupModal} type="button">
                              Добавить в группу
                            </button>
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
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isProfileDraftDirty(), closeProfileModal)}
        >
          <form className="pda-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleProfileSubmit}>
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
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isProfileDraftDirty(), closeProfileModal)}
                type="button"
              >
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
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isProfileGroupDraftDirty(), closeProfileGroupModal)}
        >
          <div className="pda-modal task-modal" onMouseDown={(event) => event.stopPropagation()}>
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
                          onChange={(event) => {
                            setGroupMemberDraft((currentDraft) => ({ ...currentDraft, groupSearchQuery: event.target.value }));
                            setProfileGroupMessage("");
                          }}
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
                            <button
                              className="command-row task-action-button"
                              disabled={isProfileSaving}
                              onClick={() => void addProfileToGroup(group.id)}
                              type="button"
                            >
                              {isProfileSaving ? "Сохранение..." : "Добавить"}
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
                      onChange={(event) => {
                        setGroupMemberDraft((currentDraft) => ({ ...currentDraft, roleType: event.target.value as StalkerGroupRoleType }));
                        setProfileGroupMessage("");
                      }}
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
                        onChange={(event) => {
                          setGroupMemberDraft((currentDraft) => ({ ...currentDraft, customRoleName: event.target.value }));
                          setProfileGroupMessage("");
                        }}
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
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isProfileGroupDraftDirty(), closeProfileGroupModal)}
                type="button"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingTaskId ? (
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isEditTaskDraftDirty(), closeEditTaskDialog)}
        >
          <form className="pda-modal task-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleEditTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Редактирование задания</h1>
                <p>Изменения сохраняются в базе данных</p>
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
                  <ActionAuthorLine action="Изменяет" name={currentUserLabel} />
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
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isEditTaskDraftDirty(), closeEditTaskDialog)}
                type="button"
              >
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
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isCompleteTaskDraftDirty(), closeCompleteTaskDialog)}
        >
          <form className="pda-modal task-modal task-complete-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleCompleteTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Засчитать выполнение задания</h1>
                <p>Статус выполнения сохранится в базе данных после подтверждения</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Подтверждение</h2>
                  <span>Выполнение будет засчитано текущим пользователем</span>
                </div>
                <div className="task-complete-grid">
                  <ActionAuthorLine action="Принимает" name={currentUserLabel} />
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {completeTaskMessage ? <p className="draft-message">{completeTaskMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isCompleteTaskDraftDirty(), closeCompleteTaskDialog)}
                type="button"
              >
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
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isTaskDraftDirty(), closeTaskDialog)}
        >
          <form className="pda-modal task-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleTaskSubmit}>
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
                  <ActionAuthorLine action="Оформляет" name={currentUserLabel} />
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
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isTaskDraftDirty(), closeTaskDialog)}
                type="button"
              >
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
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isTradeDraftDirty(), closeTradeModal)}
        >
          <form className="pda-modal task-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleTradeSubmit}>
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
                  <ActionAuthorLine action={editingTradeId ? "Изменяет" : "Оформляет"} name={currentUserLabel} />
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
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isTradeDraftDirty(), closeTradeModal)}
                type="button"
              >
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
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isViolationDraftDirty(), closeViolationModal)}
        >
          <form className="pda-modal task-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleViolationSubmit}>
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
                  <ActionAuthorLine action={editingViolationId ? "Изменяет" : "Оформляет"} name={currentUserLabel} />
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
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isViolationDraftDirty(), closeViolationModal)}
                type="button"
              >
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
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isViolationClosureDirty(), closeCloseViolationModal)}
        >
          <form className="pda-modal task-complete-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={closeViolationRecord}>
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
                <ActionAuthorLine action="Закрывает" name={currentUserLabel} />
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
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isViolationClosureDirty(), closeCloseViolationModal)}
                type="button"
              >
                Отмена
              </button>
              <button className="primary-command" type="submit">
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
          cancelLabel={confirmDialog.cancelLabel}
          variant={confirmDialog.variant}
          loading={confirmDialog.loading || isProfileDeleting}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
        />
      ) : null}
    </main>
  );
}
