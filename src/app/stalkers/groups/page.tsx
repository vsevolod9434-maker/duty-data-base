"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getTaskActionVisibility, TaskRecordCard } from "@/components/ui/TaskRecordCard";
import { addActivityLogEntry } from "@/lib/activity-log";
import { apiFetch, apiFetchJson } from "@/lib/api-client";
import { createTask, deleteTaskRecord, fetchTasks, updateTask } from "@/lib/journal-api";
import {
  stalkerGroups as initialStalkerGroups,
  stalkerProfiles as initialStalkerProfiles,
  tasks as initialTasks,
} from "@/lib/mock-data";
import type {
  StalkerGroup,
  StalkerGroupMember,
  StalkerGroupRoleType,
  StalkerProfile,
  Task,
} from "@/lib/types";
import {
  forceSystemYear,
  getAffiliationBadgeClass,
  getAffiliationLabel,
  getPaginatedItems,
  getGroupRoleLabel,
  matchesStalkerProfileSearch,
  getProfileSecondaryTitle,
  getProfileTitle,
  getSystemTimestamp,
  getTodayDate,
  groupRoleLabels,
  isTaskOverdue,
  readStoredCollection,
  SYSTEM_DATE_MAX,
  SYSTEM_DATE_MIN,
  STALKER_GROUPS_STORAGE_KEY,
  STALKER_PROFILES_STORAGE_KEY,
  STALKER_TASKS_STORAGE_KEY,
  writeStoredCollection,
} from "@/lib/stalker-utils";


const statusLabels: Record<StalkerGroup["status"], string> = {
  active: "Активна",
  archive: "Архив",
};

type StalkerProfileApiResponse = {
  id: string;
  registryNumber: string | null;
  fullName: string;
  callsign: string;
  birthDate: string | null;
  affiliation: StalkerProfile["affiliation"] | null;
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
  members: Array<{
    id: string;
    stalkerId: string;
    roleType: StalkerGroupRoleType;
    customRoleName: string | null;
    joinedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type StalkerGroupImportResponse = {
  groups: StalkerGroupApiResponse[];
  skippedMembers?: number;
};

const groupTabs = ["Состав", "Задания"] as const;

const emptyGroupDraft = {
  name: "",
  photoUrl: "",
  notes: "",
  status: "active" as StalkerGroup["status"],
  members: [] as StalkerGroupMember[],
};

const emptySelectedGroupMemberDraft = {
  searchQuery: "",
  profileId: "",
  roleType: "member" as StalkerGroupRoleType,
  customRoleName: "",
};

const emptyMemberRoleDraft = {
  roleType: "member" as StalkerGroupRoleType,
  customRoleName: "",
};

const emptyGroupTaskDraft = {
  issuedAt: getTodayDate(),
  dueAt: "",
  description: "",
  reward: "",
  notes: "",
  issuedBy: "",
  acceptedBy: "",
  status: "active" as Task["status"],
};

function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="pagination-row">
      <button className="command-row pagination-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">
        Назад
      </button>
      <span>Страница {page} из {pageCount}</span>
      <button className="command-row pagination-button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} type="button">
        Вперёд
      </button>
    </div>
  );
}

const taskStatusLabels: Record<Task["status"], string> = {
  active: "Активно",
  completed: "Выполнено",
  cancelled: "Отменено",
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

async function saveStalkerGroupRequest(
  method: "POST" | "PATCH",
  url: string,
  payload: Record<string, unknown>,
  fallbackMessage = "Не удалось сохранить группу.",
) {
  const responsePayload = await apiFetchJson<StalkerGroupApiResponse>(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, fallbackMessage);

  return normalizeApiGroup(responsePayload);
}

function getTaskStatusLabel(task: Task) {
  if (task.status === "completed") {
    return taskStatusLabels.completed;
  }

  if (task.status === "cancelled") {
    return taskStatusLabels.cancelled;
  }

  return isTaskOverdue(task) ? "Просроченное" : taskStatusLabels.active;
}

function getTaskStatusClass(task: Task) {
  if (task.status === "completed") {
    return "badge-task-completed";
  }

  if (task.status === "cancelled") {
    return "badge-task-cancelled";
  }

  return isTaskOverdue(task) ? "badge-task-overdue" : "badge-task-active";
}

function isDirtyValue(currentValue: unknown, initialValue: unknown) {
  return JSON.stringify(currentValue) !== JSON.stringify(initialValue);
}

export default function StalkerGroupsPage() {
  const [profiles, setProfiles] = useState<StalkerProfile[]>([]);
  const [groups, setGroups] = useState<StalkerGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [isGroupLoading, setIsGroupLoading] = useState(true);
  const [isGroupSaving, setIsGroupSaving] = useState(false);
  const [isGroupDeleting, setIsGroupDeleting] = useState(false);
  const [isGroupImporting, setIsGroupImporting] = useState(false);
  const [groupLoadMessage, setGroupLoadMessage] = useState("");
  const [groupActionMessage, setGroupActionMessage] = useState("");
  const [localImportGroups, setLocalImportGroups] = useState<StalkerGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupListTab, setGroupListTab] = useState<StalkerGroup["status"]>("active");
  const [activeGroupTab, setActiveGroupTab] = useState("Состав");
  const [searchQuery, setSearchQuery] = useState("");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isGroupMemberModalOpen, setIsGroupMemberModalOpen] = useState(false);
  const [isGroupTaskModalOpen, setIsGroupTaskModalOpen] = useState(false);
  const [editingGroupTaskId, setEditingGroupTaskId] = useState("");
  const [editingMemberRoleId, setEditingMemberRoleId] = useState("");
  const [editingGroupId, setEditingGroupId] = useState("");
  const [draft, setDraft] = useState(emptyGroupDraft);
  const [groupTaskDraft, setGroupTaskDraft] = useState(emptyGroupTaskDraft);
  const [selectedGroupMemberDraft, setSelectedGroupMemberDraft] = useState(emptySelectedGroupMemberDraft);
  const [memberRoleDraft, setMemberRoleDraft] = useState(emptyMemberRoleDraft);
  const [formMessage, setFormMessage] = useState("");
  const [memberFormMessage, setMemberFormMessage] = useState("");
  const [memberRoleMessage, setMemberRoleMessage] = useState("");
  const [groupTaskFormMessage, setGroupTaskFormMessage] = useState("");
  const [tableMessage, setTableMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    variant?: "danger" | "default" | "warning";
    loading?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [completingGroupTaskId, setCompletingGroupTaskId] = useState("");
  const [completeGroupTaskAcceptedBy, setCompleteGroupTaskAcceptedBy] = useState("");
  const [completeGroupTaskMessage, setCompleteGroupTaskMessage] = useState("");

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  useEffect(() => {
    let isCancelled = false;

    const storageReadHandle = window.setTimeout(() => {
      const localProfiles = readStoredCollection<StalkerProfile>(STALKER_PROFILES_STORAGE_KEY, initialStalkerProfiles);
      const localGroups = readStoredCollection<StalkerGroup>(STALKER_GROUPS_STORAGE_KEY, initialStalkerGroups);
      const localTasks = readStoredCollection<Task>(STALKER_TASKS_STORAGE_KEY, initialTasks);
      setTasks(localTasks);

      async function loadServerData() {
        setIsGroupLoading(true);
        setGroupLoadMessage("");

        try {
          const [serverProfiles, serverGroups, serverTasks] = await Promise.all([
            fetchStalkerProfiles().catch(() => localProfiles),
            fetchStalkerGroups(),
            fetchTasks().catch(() => localTasks),
          ]);

          if (isCancelled) {
            return;
          }

          setProfiles(serverProfiles);
          setGroups(serverGroups);
          setTasks(serverTasks);

          if (serverGroups.length > 0) {
            writeStoredCollection(STALKER_GROUPS_STORAGE_KEY, serverGroups);
            setLocalImportGroups([]);
          } else if (localGroups.length > 0) {
            setLocalImportGroups(localGroups);
          }

          writeStoredCollection(STALKER_TASKS_STORAGE_KEY, serverTasks);
        } catch {
          if (isCancelled) {
            return;
          }

          setProfiles(localProfiles);
          setGroupLoadMessage(
            "Не удалось загрузить группы.",
          );

          if (localGroups.length > 0) {
            setLocalImportGroups(localGroups);
          }
        } finally {
          if (!isCancelled) {
            setIsStorageReady(true);
            setIsGroupLoading(false);
          }
        }
      }

      void loadServerData();
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

    if (groups.length === 0 && localImportGroups.length > 0) {
      return;
    }

    writeStoredCollection(STALKER_GROUPS_STORAGE_KEY, groups);
  }, [groups, isStorageReady, localImportGroups.length]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(STALKER_TASKS_STORAGE_KEY, tasks);
  }, [isStorageReady, tasks]);

  const visibleGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return groups
      .filter((group) => group.status === groupListTab)
      .filter((group) => {
        if (!query) {
          return true;
        }

        const memberText = group.members
          .map((member) => {
            const profile = profileById.get(member.stalkerId);
            return profile ? `${profile.fullName} ${profile.callsign}` : "";
          })
          .join(" ");

        return `${group.name} ${memberText}`.toLowerCase().includes(query);
      });
  }, [groupListTab, groups, profileById, searchQuery]);

  const paginatedGroups = useMemo(() => getPaginatedItems(visibleGroups, groupPage), [groupPage, visibleGroups]);
  const visibleGroupCount = isStorageReady ? visibleGroups.length : 0;
  const shownGroupCount = isStorageReady ? paginatedGroups.items.length : 0;
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );
  const selectedGroupTasks = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    return tasks.filter((task) => task.assigneeType === "group" && task.groupId === selectedGroup.id);
  }, [selectedGroup, tasks]);
  const selectedGroupTaskMark = useMemo(() => {
    const activeTasks = selectedGroupTasks.filter((task) => task.status === "active");

    if (activeTasks.some(isTaskOverdue)) {
      return "overdue" as const;
    }

    return activeTasks.length > 0 ? ("active" as const) : ("none" as const);
  }, [selectedGroupTasks]);
  const availableProfiles = useMemo(() => profiles.filter((profile) => profile.status === "active"), [profiles]);
  const selectedGroupAvailableProfiles = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    const query = selectedGroupMemberDraft.searchQuery.trim();
    const selectedMemberIds = new Set(selectedGroup.members.map((member) => member.stalkerId));

    if (!query) {
      return [];
    }

    return availableProfiles
      .filter((profile) => !selectedMemberIds.has(profile.id))
      .filter((profile) => matchesStalkerProfileSearch(profile, query))
      .slice(0, 12);
  }, [availableProfiles, selectedGroup, selectedGroupMemberDraft.searchQuery]);
  const selectedGroupMemberProfile = useMemo(() => {
    if (!selectedGroupMemberDraft.profileId) {
      return null;
    }

    return profileById.get(selectedGroupMemberDraft.profileId) ?? null;
  }, [profileById, selectedGroupMemberDraft.profileId]);
  const memberSearchResults = useMemo(() => {
    const query = memberSearchQuery.trim();
    const selectedMemberIds = new Set(draft.members.map((member) => member.stalkerId));

    if (!query) {
      return [];
    }

    return availableProfiles
      .filter((profile) => !selectedMemberIds.has(profile.id))
      .filter((profile) => matchesStalkerProfileSearch(profile, query))
      .slice(0, 8);
  }, [availableProfiles, draft.members, memberSearchQuery]);

  function resetDraft() {
    setDraft(emptyGroupDraft);
    setMemberSearchQuery("");
    setEditingGroupId("");
    setFormMessage("");
  }

  function openCreateGroup() {
    resetDraft();
    setIsGroupModalOpen(true);
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
    event: MouseEvent<HTMLElement>,
    isDirty: boolean,
    closeModal: () => void,
  ) {
    if (event.target === event.currentTarget) {
      requestDirtyModalClose(isDirty, closeModal);
    }
  }

  function getInitialGroupDraft() {
    const group = editingGroupId ? groups.find((currentGroup) => currentGroup.id === editingGroupId) : null;

    if (!group) {
      return emptyGroupDraft;
    }

    return {
      name: group.name,
      photoUrl: group.photoUrl ?? "",
      notes: group.notes,
      status: group.status,
      members: group.members,
    };
  }

  function isGroupDraftDirty() {
    return isDirtyValue(draft, getInitialGroupDraft());
  }

  function isSelectedGroupMemberDraftDirty() {
    return isDirtyValue(selectedGroupMemberDraft, emptySelectedGroupMemberDraft);
  }

  function getInitialMemberRoleDraft() {
    const member = editingMemberRoleId
      ? selectedGroup?.members.find((currentMember) => currentMember.id === editingMemberRoleId)
      : null;

    if (!member) {
      return emptyMemberRoleDraft;
    }

    return {
      roleType: member.roleType,
      customRoleName: member.customRoleName ?? "",
    };
  }

  function isMemberRoleDraftDirty() {
    return isDirtyValue(memberRoleDraft, getInitialMemberRoleDraft());
  }

  function getInitialGroupTaskDraft() {
    const task = editingGroupTaskId ? tasks.find((currentTask) => currentTask.id === editingGroupTaskId) : null;

    if (!task) {
      return emptyGroupTaskDraft;
    }

    return {
      issuedAt: task.issuedAt,
      dueAt: task.dueAt,
      description: task.description,
      reward: task.reward ?? "",
      notes: task.notes ?? "",
      issuedBy: task.issuedBy ?? "",
      acceptedBy: task.acceptedBy ?? "",
      status: task.status,
    };
  }

  function isGroupTaskDraftDirty() {
    return isDirtyValue(groupTaskDraft, getInitialGroupTaskDraft());
  }

  function isCompleteGroupTaskDirty() {
    return completeGroupTaskAcceptedBy.trim().length > 0;
  }

  function openEditGroup(group: StalkerGroup) {
    setDraft({
      name: group.name,
      photoUrl: group.photoUrl ?? "",
      notes: group.notes,
      status: group.status,
      members: group.members,
    });
    setEditingGroupId(group.id);
    setFormMessage("");
    setIsGroupModalOpen(true);
  }

  function closeGroupModal() {
    setIsGroupModalOpen(false);
    resetDraft();
  }

  function resetSelectedGroupMemberDraft() {
    setSelectedGroupMemberDraft(emptySelectedGroupMemberDraft);
    setMemberFormMessage("");
  }

  function openGroupMemberModal() {
    resetSelectedGroupMemberDraft();
    setIsGroupMemberModalOpen(true);
  }

  function closeGroupMemberModal() {
    setIsGroupMemberModalOpen(false);
    resetSelectedGroupMemberDraft();
  }

  function openEditMemberRoleModal(member: StalkerGroupMember) {
    setEditingMemberRoleId(member.id);
    setMemberRoleDraft({
      roleType: member.roleType,
      customRoleName: member.customRoleName ?? "",
    });
    setMemberRoleMessage("");
  }

  function closeEditMemberRoleModal() {
    setEditingMemberRoleId("");
    setMemberRoleDraft(emptyMemberRoleDraft);
    setMemberRoleMessage("");
  }

  function updateMemberRole(memberId: string, roleType: StalkerGroupRoleType) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      members: currentDraft.members.map((member) =>
        member.id === memberId
          ? {
              ...member,
              roleType,
              customRoleName: roleType === "custom" ? member.customRoleName : null,
            }
          : member,
      ),
    }));
  }

  function updateMemberCustomRole(memberId: string, customRoleName: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      members: currentDraft.members.map((member) =>
        member.id === memberId ? { ...member, customRoleName } : member,
      ),
    }));
  }

  function addMember(profileId: string) {
    setDraft((currentDraft) => {
      if (currentDraft.members.some((member) => member.stalkerId === profileId)) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        members: [
          ...currentDraft.members,
          {
            id: `member-${profileId}-${Date.now()}`,
            stalkerId: profileId,
            roleType: "member",
            customRoleName: null,
            joinedAt: getSystemTimestamp(),
          },
        ],
      };
    });
    setMemberSearchQuery("");
  }

  function removeMember(memberId: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      members: currentDraft.members.filter((member) => member.id !== memberId),
    }));
  }

  function buildGroupPayload(group: StalkerGroup, nextMembers = group.members) {
    return {
      name: group.name,
      photoUrl: group.photoUrl ?? null,
      notes: group.notes,
      status: group.status,
      members: nextMembers,
    };
  }

  async function patchSelectedGroup(nextGroup: StalkerGroup, successMessage: string) {
    const updatedGroup = await saveStalkerGroupRequest(
      "PATCH",
      `/api/stalker-groups/${encodeURIComponent(nextGroup.id)}`,
      buildGroupPayload(nextGroup),
      "Не удалось обновить состав группы.",
    );

    setGroups((currentGroups) =>
      currentGroups.map((group) => (group.id === updatedGroup.id ? updatedGroup : group)),
    );
    setTableMessage(successMessage);
    return updatedGroup;
  }

  async function addMemberToSelectedGroup() {
    if (!selectedGroup) {
      return;
    }

    const profileId = selectedGroupMemberDraft.profileId;
    const customRoleName = selectedGroupMemberDraft.customRoleName.trim();
    const profile = profileById.get(profileId);

    if (!profileId) {
      setMemberFormMessage("Выберите профиль.");
      return;
    }

    if (selectedGroup.members.some((member) => member.stalkerId === profileId)) {
      setMemberFormMessage("Профиль уже состоит в этой группе.");
      return;
    }

    if (selectedGroupMemberDraft.roleType === "custom" && !customRoleName) {
      setMemberFormMessage("Укажите название роли.");
      return;
    }

    const now = getSystemTimestamp();
    const nextMembers = [
      ...selectedGroup.members,
      {
        id: `member-${profileId}-${now}`,
        stalkerId: profileId,
        roleType: selectedGroupMemberDraft.roleType,
        customRoleName: selectedGroupMemberDraft.roleType === "custom" ? customRoleName : null,
        joinedAt: now,
      },
    ];
    const nextGroup = {
      ...selectedGroup,
      members: nextMembers,
      updatedAt: now,
    };

    setIsGroupSaving(true);
    setGroupActionMessage("");

    try {
      await patchSelectedGroup(nextGroup, "Участник добавлен в группу.");
      closeGroupMemberModal();
      addActivityLogEntry({
        type: "group",
        title: `Сталкер добавлен в группу: ${selectedGroup.name}`,
        status: "OK",
        description: profile ? getProfileTitle(profile) : profileId,
      });
    } catch (error) {
      setMemberFormMessage(
        error instanceof Error ? error.message : "Не удалось обновить состав группы.",
      );
    } finally {
      setIsGroupSaving(false);
    }
  }

  async function saveSelectedGroupMemberRole() {
    if (!selectedGroup || !editingMemberRoleId) {
      return;
    }

    const customRoleName = memberRoleDraft.customRoleName.trim();
    const member = selectedGroup.members.find((currentMember) => currentMember.id === editingMemberRoleId);
    const profile = member ? profileById.get(member.stalkerId) : null;

    if (memberRoleDraft.roleType === "custom" && !customRoleName) {
      setMemberRoleMessage("Укажите название роли.");
      return;
    }

    const now = getSystemTimestamp();
    const nextGroup = {
      ...selectedGroup,
      members: selectedGroup.members.map((member) =>
        member.id === editingMemberRoleId
          ? {
              ...member,
              roleType: memberRoleDraft.roleType,
              customRoleName: memberRoleDraft.roleType === "custom" ? customRoleName : null,
            }
          : member,
      ),
      updatedAt: now,
    };

    setIsGroupSaving(true);
    setGroupActionMessage("");

    try {
      await patchSelectedGroup(nextGroup, "Роль участника обновлена.");
      closeEditMemberRoleModal();
      addActivityLogEntry({
        type: "group",
        title: `Изменена роль участника группы: ${selectedGroup.name}`,
        status: "OK",
        description: profile ? getProfileTitle(profile) : "Профиль не найден",
      });
    } catch {
      setMemberRoleMessage(
        "Не удалось обновить роль.",
      );
    } finally {
      setIsGroupSaving(false);
    }
  }

  async function removeSelectedGroupMember(memberId: string) {
    const member = selectedGroup?.members.find((currentMember) => currentMember.id === memberId);
    const profile = member ? profileById.get(member.stalkerId) : null;

    if (!selectedGroup) {
      return;
    }

    const nextGroup = {
      ...selectedGroup,
      members: selectedGroup.members.filter((member) => member.id !== memberId),
      updatedAt: getSystemTimestamp(),
    };

    setIsGroupSaving(true);
    setGroupActionMessage("");

    try {
      await patchSelectedGroup(nextGroup, "Участник исключён из группы.");
      addActivityLogEntry({
        type: "group",
        title: `Сталкер удалён из группы: ${selectedGroup.name}`,
        status: "WARN",
        description: profile ? getProfileTitle(profile) : "Профиль не найден",
      });
    } catch {
      setGroupActionMessage(
        "Не удалось исключить участника.",
      );
    } finally {
      setIsGroupSaving(false);
    }
  }

  async function handleGroupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draft.name.trim();
    const photoUrl = draft.photoUrl.trim();

    if (!name) {
      setFormMessage("Укажите название группы.");
      return;
    }

    if (
      draft.members.some(
        (member) => member.roleType === "custom" && !member.customRoleName?.trim(),
      )
    ) {
      setFormMessage("Для роли ручного ввода укажите название роли.");
      return;
    }

    const normalizedMembers = draft.members.map((member) => ({
      ...member,
      customRoleName:
        member.roleType === "custom" ? member.customRoleName?.trim() || null : null,
    }));
    const payload = {
      name,
      photoUrl: photoUrl || null,
      notes: draft.notes.trim(),
      status: draft.status,
      members: normalizedMembers,
    };

    setIsGroupSaving(true);
    setFormMessage("");
    setGroupActionMessage("");

    try {
      if (editingGroupId) {
        const updatedGroup = await saveStalkerGroupRequest(
          "PATCH",
          `/api/stalker-groups/${encodeURIComponent(editingGroupId)}`,
          payload,
        );

      setGroups((currentGroups) =>
        currentGroups.map((group) => (group.id === updatedGroup.id ? updatedGroup : group)),
      );
      setGroupListTab(updatedGroup.status);
      setTableMessage("Группа обновлена в базе данных.");
      addActivityLogEntry({
        type: "group",
        title: `Изменена группа: ${name}`,
        status: "OK",
      });
    } else {
      const newGroup = await saveStalkerGroupRequest("POST", "/api/stalker-groups", payload);

      setGroups((currentGroups) => [newGroup, ...currentGroups]);
      setSelectedGroupId(newGroup.id);
      setActiveGroupTab("Состав");
      setGroupListTab(newGroup.status);
      setTableMessage("Группа создана.");
      addActivityLogEntry({
        type: "group",
        title: `Создана группа: ${name}`,
        status: "OK",
      });
    }

    setGroupPage(1);
    closeGroupModal();
    } catch {
      setFormMessage(
        "Не удалось сохранить группу.",
      );
    } finally {
      setIsGroupSaving(false);
    }
  }

  async function setGroupStatus(groupId: string, status: StalkerGroup["status"]) {
    const group = groups.find((currentGroup) => currentGroup.id === groupId);

    if (!group) {
      return;
    }

    setIsGroupSaving(true);
    setGroupActionMessage("");

    try {
      const updatedGroup = await saveStalkerGroupRequest(
        "PATCH",
        `/api/stalker-groups/${encodeURIComponent(groupId)}`,
        { status },
      );

      setGroups((currentGroups) =>
        currentGroups.map((group) => (group.id === groupId ? updatedGroup : group)),
      );
      setGroupListTab(status);
      setSelectedGroupId("");
      setActiveGroupTab("");
      setGroupPage(1);
      setTableMessage(status === "archive" ? "Группа перенесена в архив." : "Группа возвращена в активные.");
      addActivityLogEntry({
        type: "group",
        title:
          status === "archive"
            ? `Группа перенесена в архив: ${group.name}`
            : `Группа возвращена из архива: ${group.name}`,
        status: status === "archive" ? "WARN" : "OK",
      });
    } catch {
      setGroupActionMessage(
        "Не удалось изменить статус группы.",
      );
    } finally {
      setIsGroupSaving(false);
    }
  }

  async function deleteGroup(groupId: string) {
    const group = groups.find((currentGroup) => currentGroup.id === groupId);

    setIsGroupDeleting(true);
    setGroupActionMessage("");

    try {
      await apiFetch(`/api/stalker-groups/${encodeURIComponent(groupId)}`, { method: "DELETE" }, "Не удалось удалить группу.");

      setGroups((currentGroups) => currentGroups.filter((group) => group.id !== groupId));
      setSelectedGroupId("");
      setActiveGroupTab("");
      setGroupPage(1);
      setTableMessage("Группа удалена. Профили участников не изменены.");
      addActivityLogEntry({
        type: "group",
        title: `Группа удалена: ${group?.name ?? "Без названия"}`,
        status: "WARN",
      });
    } catch {
      setGroupActionMessage(
        "Не удалось удалить группу.",
      );
    } finally {
      setIsGroupDeleting(false);
    }
  }

  async function importLocalGroups() {
    if (localImportGroups.length === 0) {
      return;
    }

    setIsGroupImporting(true);
    setGroupActionMessage("");

    try {
      const payload = await apiFetchJson<StalkerGroupImportResponse>("/api/stalker-groups/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(localImportGroups),
      });

      const importedGroups = payload.groups.map(normalizeApiGroup);
      setGroups(importedGroups);
      writeStoredCollection(STALKER_GROUPS_STORAGE_KEY, importedGroups);
      setLocalImportGroups([]);
      setGroupPage(1);
      setTableMessage(
        payload.skippedMembers && payload.skippedMembers > 0
          ? `Записи групп импортированы. Пропущено участников без профиля: ${payload.skippedMembers}.`
          : "Записи групп импортированы.",
      );
    } catch {
      setGroupActionMessage(
        "Не удалось выполнить импорт групп.",
      );
    } finally {
      setIsGroupImporting(false);
    }
  }

  function changeListTab(tab: StalkerGroup["status"]) {
    setGroupListTab(tab);
    setGroupPage(1);
    setSelectedGroupId("");
    setActiveGroupTab("");
  }

  function changeSearchQuery(value: string) {
    setSearchQuery(value);
    setGroupPage(1);
  }

  function getGroupMemberPreview(group: StalkerGroup) {
    if (group.members.length === 0) {
      return "Участники не добавлены";
    }

    const names = group.members.map((member) => {
      const profile = profileById.get(member.stalkerId);

      return profile ? getProfileTitle(profile) : "Профиль не найден";
    });
    const visibleNames = names.slice(0, 3);
    const remainingCount = names.length - visibleNames.length;

    return remainingCount > 0
      ? `Участники: ${visibleNames.join(", ")} и ещё ${remainingCount}`
      : `Участники: ${visibleNames.join(", ")}`;
  }

  function openGroupTaskModal() {
    setEditingGroupTaskId("");
    setGroupTaskDraft(emptyGroupTaskDraft);
    setGroupTaskFormMessage("");
    setIsGroupTaskModalOpen(true);
  }

  function openEditGroupTaskModal(task: Task) {
    setEditingGroupTaskId(task.id);
    setGroupTaskDraft({
      issuedAt: task.issuedAt,
      dueAt: task.dueAt,
      description: task.description,
      reward: task.reward ?? "",
      notes: task.notes ?? "",
      issuedBy: task.issuedBy ?? "",
      acceptedBy: task.acceptedBy ?? "",
      status: task.status,
    });
    setGroupTaskFormMessage("");
    setIsGroupTaskModalOpen(true);
  }

  function closeGroupTaskModal() {
    setIsGroupTaskModalOpen(false);
    setEditingGroupTaskId("");
    setGroupTaskDraft(emptyGroupTaskDraft);
    setGroupTaskFormMessage("");
  }

  function closeCompleteGroupTaskModal() {
    setCompletingGroupTaskId("");
    setCompleteGroupTaskAcceptedBy("");
    setCompleteGroupTaskMessage("");
  }

  function updateGroupTaskDraft<Field extends keyof typeof groupTaskDraft>(
    field: Field,
    value: (typeof groupTaskDraft)[Field],
  ) {
    const nextValue =
      typeof value === "string" && (field === "issuedAt" || field === "dueAt")
        ? (forceSystemYear(value) as (typeof groupTaskDraft)[Field])
        : value;

    setGroupTaskDraft((currentDraft) => ({ ...currentDraft, [field]: nextValue }));
    setGroupTaskFormMessage("");
  }

  async function handleGroupTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedGroup) {
      return;
    }

    const description = groupTaskDraft.description.trim();
    const acceptedBy = groupTaskDraft.acceptedBy.trim();

    if (!description) {
      setGroupTaskFormMessage("Опишите задание.");
      return;
    }

    if (groupTaskDraft.status === "completed" && !acceptedBy) {
      setGroupTaskFormMessage("Укажите, кто принял выполнение задания.");
      return;
    }

    if (editingGroupTaskId) {
      const currentTask = tasks.find((task) => task.id === editingGroupTaskId);
      const updatedTask = await updateTask(editingGroupTaskId, {
        issuedAt: groupTaskDraft.issuedAt,
        dueAt: groupTaskDraft.dueAt,
        description,
        reward: groupTaskDraft.reward.trim(),
        notes: groupTaskDraft.notes.trim(),
        issuedBy: groupTaskDraft.issuedBy.trim(),
        acceptedBy: groupTaskDraft.status === "completed" ? acceptedBy : null,
        completedAt: groupTaskDraft.status === "completed" ? currentTask?.completedAt || getSystemTimestamp() : null,
        status: groupTaskDraft.status,
      }).catch(() => {
        setGroupTaskFormMessage("Не удалось сохранить групповое задание.");
        return null;
      });

      if (!updatedTask) {
        return;
      }

      setTasks((currentTasks) => currentTasks.map((task) => (task.id === editingGroupTaskId ? updatedTask : task)));
      setTableMessage("Групповое задание обновлено.");
      addActivityLogEntry({
        type: "task",
        title: `Групповое задание изменено: ${selectedGroup.name} — ${description}`,
        status: "OK",
      });
      closeGroupTaskModal();
      return;
    }

    const completedAt = groupTaskDraft.status === "completed" ? getSystemTimestamp() : null;
    const newTask = await createTask({
      assigneeType: "group",
      stalkerId: null,
      groupId: selectedGroup.id,
      issuedAt: groupTaskDraft.issuedAt,
      dueAt: groupTaskDraft.dueAt,
      description,
      reward: groupTaskDraft.reward.trim(),
      notes: groupTaskDraft.notes.trim(),
      issuedBy: groupTaskDraft.issuedBy.trim(),
      acceptedBy: groupTaskDraft.status === "completed" ? acceptedBy : null,
      completedAt,
      status: groupTaskDraft.status,
    }).catch(() => {
      setGroupTaskFormMessage("Не удалось создать групповое задание.");
      return null;
    });

    if (!newTask) {
      return;
    }

    setTasks((currentTasks) => [newTask, ...currentTasks]);
    setTableMessage("Групповое задание создано.");
    addActivityLogEntry({
      type: "task",
      title: `Выдано групповое задание: ${selectedGroup.name} — ${description}`,
      status: "OK",
    });
    closeGroupTaskModal();
  }

  function completeGroupTask(taskId: string) {
    setCompletingGroupTaskId(taskId);
    setCompleteGroupTaskAcceptedBy("");
    setCompleteGroupTaskMessage("");
  }

  async function submitCompleteGroupTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const task = tasks.find((currentTask) => currentTask.id === completingGroupTaskId);
    const normalizedAcceptedBy = completeGroupTaskAcceptedBy.trim();

    if (!task) {
      return;
    }

    if (!normalizedAcceptedBy) {
      setCompleteGroupTaskMessage("Укажите, кто принял выполнение задания.");
      return;
    }

    const updatedTask = await updateTask(completingGroupTaskId, {
      acceptedBy: normalizedAcceptedBy,
      completedAt: getSystemTimestamp(),
      status: "completed",
    }).catch(() => {
      setCompleteGroupTaskMessage("Не удалось засчитать задание.");
      return null;
    });

    if (!updatedTask) {
      return;
    }

    setTasks((currentTasks) => currentTasks.map((task) => (task.id === completingGroupTaskId ? updatedTask : task)));
    setTableMessage("Групповое задание засчитано.");
    addActivityLogEntry({
      type: "task",
      title: `Групповое задание выполнено: ${selectedGroup?.name ?? "Группа не найдена"} — ${task?.description ?? "Без описания"}`,
      status: "OK",
    });
    closeCompleteGroupTaskModal();
  }

  function openGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setActiveGroupTab("Состав");
  }

  async function cancelGroupTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);

    const updatedTask = await updateTask(taskId, { status: "cancelled" }).catch(() => {
      setTableMessage("Не удалось отменить групповое задание.");
      return null;
    });

    if (!updatedTask) {
      return;
    }

    setTasks((currentTasks) => currentTasks.map((task) => (task.id === taskId ? updatedTask : task)));
    setTableMessage("Групповое задание отменено.");
    addActivityLogEntry({
      type: "task",
      title: `Групповое задание отменено: ${selectedGroup?.name ?? "Группа не найдена"} — ${task?.description ?? "Без описания"}`,
      status: "WARN",
    });
  }

  function deleteGroupTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);

    setConfirmDialog({
      title: "Удаление задания",
      message: "Удалить групповое задание окончательно?",
      confirmLabel: "Удалить",
      variant: "danger",
      onConfirm: async () => {
        await deleteTaskRecord(taskId);
        setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
        setTableMessage("Групповое задание удалено.");
        addActivityLogEntry({
          type: "task",
          title: `Групповое задание удалено: ${selectedGroup?.name ?? "Группа не найдена"} — ${task?.description ?? "Без описания"}`,
          status: "WARN",
        });
        setConfirmDialog(null);
      },
    });
  }

  function renderGroupRecordAction() {
    if (activeGroupTab === "Задания") {
      return (
        <button className="command-row group-record-action" onClick={openGroupTaskModal} type="button">
          Выдать задание группе
        </button>
      );
    }

    if (activeGroupTab === "Состав") {
      return (
        <button className="command-row group-record-action" onClick={openGroupMemberModal} type="button">
          Добавить участника
        </button>
      );
    }

    return null;
  }

  return (
    <main className="pda-page groups-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Сталкеры" activeSubtabLabel="Группы" />

        <div className="pda-content">
          <section className="section-panel groups-workspace-panel">
            <div className="profile-card-grid groups-command-grid">
              <section className="profile-column groups-list-column">
                <div className="list-header-block">
                  <div className="column-header list-column-header">
                    <h2>Реестр групп</h2>
                    <button className="primary-command profile-create-button" onClick={openCreateGroup} type="button">
                      Создать группу
                    </button>
                  </div>

                  <div className="list-tabs segmented-tabs" role="tablist" aria-label="Статус групп">
                    <button className={groupListTab === "active" ? "list-tab list-tab-active" : "list-tab"} onClick={() => changeListTab("active")} type="button">
                      Активные
                    </button>
                    <button className={groupListTab === "archive" ? "list-tab list-tab-active" : "list-tab"} onClick={() => changeListTab("archive")} type="button">
                      Архив
                    </button>
                  </div>
                </div>

                <div className="filter-bar profile-list-filter">
                  <label className="filter-field">
                    <span className="filter-label-row">
                      <span>Поиск</span>
                      <span>Записей: {shownGroupCount} из {visibleGroupCount}</span>
                    </span>
                    <input
                      onChange={(event) => changeSearchQuery(event.target.value)}
                      placeholder="Название группы или участник"
                      type="text"
                      value={searchQuery}
                    />
                  </label>
                </div>

                {groupLoadMessage ? <p className="draft-message">{groupLoadMessage}</p> : null}
                {groupActionMessage ? <p className="draft-message">{groupActionMessage}</p> : null}
                {tableMessage ? <p className="table-message">{tableMessage}</p> : null}
                {localImportGroups.length > 0 ? (
                  <div className="empty-state compact-empty-state">
                    <p>Найдены записи групп для импорта.</p>
                    <span>Можно импортировать {localImportGroups.length} записей в базу учёта. </span>
                    <button
                      className="primary-command"
                      disabled={isGroupImporting}
                      onClick={importLocalGroups}
                      type="button"
                    >
                      {isGroupImporting ? "Импорт..." : "Импортировать записи"}
                    </button>
                  </div>
                ) : null}

                <div className="profile-list">
                  {!isStorageReady || isGroupLoading ? (
                    <div className="empty-state">
                      <p>Загрузка групп...</p>
                    </div>
                  ) : paginatedGroups.items.length > 0 ? (
                    paginatedGroups.items.map((group) => (
                      <button
                        className={`profile-list-item group-list-card ${group.id === selectedGroupId ? "profile-list-item-active" : ""}`}
                        key={group.id}
                        onClick={() => openGroup(group.id)}
                        type="button"
                      >
                        <span className="profile-list-item-head">
                          <span className="profile-list-item-main group-list-item-main">
                            <strong className="group-list-name">{group.name || "Без названия"}</strong>
                            <span className="profile-list-item-secondary group-list-meta">
                              {getGroupMemberPreview(group)}
                            </span>
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p>{groupListTab === "active" ? "Активные группы не найдены." : "Архив групп пуст."}</p>
                    </div>
                  )}
                </div>

                {isStorageReady && !isGroupLoading ? (
                  <Pagination page={paginatedGroups.page} pageCount={paginatedGroups.pageCount} onPageChange={setGroupPage} />
                ) : null}
              </section>

              <section className="profile-column detail-host-column">
                {!isStorageReady || isGroupLoading ? (
                  <div className="empty-state">
                    <p>Загрузка групп...</p>
                  </div>
                ) : selectedGroup ? (
                  <div className="profile-detail">
                    <div className="profile-case-card group-case-card group-hero-card">
                      <div className="group-avatar-frame">
                        <img
                          alt="Изображение сталкерской группы"
                          src={selectedGroup.photoUrl || "/no-data-group.png"}
                        />
                      </div>
                      <div className="group-hero-main">
                        <div className="group-hero-head">
                          <div className="profile-badges group-hero-badges">
                            {selectedGroup.status === "archive" ? (
                              <span className="profile-badge badge-chip badge-state-archive">
                                {statusLabels[selectedGroup.status]}
                              </span>
                            ) : null}
                            {selectedGroupTaskMark === "active" ? (
                              <span className="profile-badge badge-chip badge-task-active">Активное задание</span>
                            ) : null}
                            {selectedGroupTaskMark === "overdue" ? (
                              <span className="profile-badge badge-chip badge-task-overdue">Просроченное задание</span>
                            ) : null}
                          </div>

                          <div className="profile-case-title">
                            <h3>{selectedGroup.name}</h3>
                            <p>Участников: {selectedGroup.members.length} · Статус: {statusLabels[selectedGroup.status]}</p>
                          </div>
                        </div>

                        <div className="group-hero-notes">
                          <section className="group-hero-note">
                            <span>Заметки</span>
                            <p>{selectedGroup.notes || "Заметок нет."}</p>
                          </section>
                        </div>
                      </div>
                      <div className="detail-actions group-hero-actions">
                        <button className="command-row task-action-button" disabled={isGroupSaving || isGroupDeleting} onClick={() => openEditGroup(selectedGroup)} type="button">
                          Редактировать
                        </button>
                        {selectedGroup.status === "active" ? (
                        <button className="command-row task-action-button" disabled={isGroupSaving || isGroupDeleting} onClick={() => setGroupStatus(selectedGroup.id, "archive")} type="button">
                            В архив
                          </button>
                        ) : (
                          <button className="command-row task-action-button" disabled={isGroupSaving || isGroupDeleting} onClick={() => setGroupStatus(selectedGroup.id, "active")} type="button">
                            Вернуть из архива
                          </button>
                        )}
                        <button
                          className="command-row task-action-button"
                          disabled={isGroupSaving || isGroupDeleting}
                          onClick={() =>
                            setConfirmDialog({
                              title: "Удаление группы",
                              message: "Удалить группу окончательно? Профили участников удалены не будут.",
                              confirmLabel: "Удалить",
                              variant: "danger",
                              loading: isGroupDeleting,
                              onConfirm: async () => {
                                await deleteGroup(selectedGroup.id);
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

                    <section className="group-records-area">
                      <div className="group-records-toolbar">
                        <div className="groups-record-tabs" role="tablist" aria-label="Разделы группы">
                          {groupTabs.map((tab) => (
                            <button
                              className={`groups-record-tab ${tab === activeGroupTab ? "groups-record-tab-active" : ""}`}
                              key={tab}
                              onClick={() => setActiveGroupTab(tab)}
                              type="button"
                            >
                              {tab}
                            </button>
                          ))}
                        </div>
                        <div className="group-records-actions">{renderGroupRecordAction()}</div>
                      </div>

                      {!activeGroupTab ? (
                        <div className="empty-state group-records-empty">
                          <p>Выберите раздел группы.</p>
                          <span>Откройте задания или состав выбранной группы.</span>
                        </div>
                      ) : activeGroupTab === "Задания" ? (
                        <div className="task-list group-task-list">
                          {selectedGroupTasks.length > 0 ? (
                            selectedGroupTasks.map((task) => {
                              const taskActions = getTaskActionVisibility(task);

                              return (
                                <TaskRecordCard
                                  actions={
                                    <>
                                      {taskActions.canEdit ? (
                                        <button className="command-row task-action-button" onClick={() => openEditGroupTaskModal(task)} type="button">
                                          Редактировать
                                        </button>
                                      ) : null}
                                      {taskActions.canComplete ? (
                                        <button className="command-row task-action-button" onClick={() => completeGroupTask(task.id)} type="button">
                                          Засчитать
                                        </button>
                                      ) : null}
                                      {taskActions.canCancel ? (
                                        <button className="command-row task-action-button" onClick={() => cancelGroupTask(task.id)} type="button">
                                          Отменить
                                        </button>
                                      ) : null}
                                      {taskActions.canDelete ? (
                                        <button className="command-row task-action-button" onClick={() => deleteGroupTask(task.id)} type="button">
                                          Удалить
                                        </button>
                                      ) : null}
                                    </>
                                  }
                                  assigneeLabel={selectedGroup.name}
                                  formatDate={formatDate}
                                  key={task.id}
                                  statusClassName={getTaskStatusClass(task)}
                                  statusLabel={getTaskStatusLabel(task)}
                                  task={task}
                                />
                              );
                            })
                          ) : (
                            <div className="empty-state compact-empty-state">
                              <p>Групповых заданий пока нет.</p>
                              <span>Создать задание для группы можно кнопкой справа от вкладок.</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="group-member-list detailed-member-list">
                          {selectedGroup.members.length > 0 ? (
                            selectedGroup.members.map((member) => {
                              const profile = profileById.get(member.stalkerId);
                              const secondaryTitle = profile
                                ? getProfileSecondaryTitle(profile) || profile.fullName || profile.registryNumber || ""
                                : "Профиль отсутствует";
                              const roleLabel = getGroupRoleLabel(member.roleType, member.customRoleName);

                              return (
                                <div className="group-member-row detailed-member-row apartment-tenant-row" key={member.id}>
                                  <div className="member-avatar">
                                    {profile?.photoUrl ? (
                                      <img alt="Фото участника группы" src={profile.photoUrl} />
                                    ) : (
                                      <img
                                        alt="Стоковое изображение участника группы"
                                        className="member-avatar-placeholder"
                                        src="/no-data-person.png"
                                      />
                                    )}
                                  </div>
                                  <div className="member-identity">
                                    <div className="apartment-tenant-title-row">
                                      <strong>{profile ? getProfileTitle(profile) : "Профиль не найден"}</strong>
                                      {profile ? (
                                        <span className={`profile-affiliation-badge badge-chip ${getAffiliationBadgeClass(profile.affiliation)}`}>
                                          {getAffiliationLabel(profile.affiliation)}
                                        </span>
                                      ) : null}
                                    </div>
                                    {secondaryTitle ? <span>{secondaryTitle}</span> : null}
                                    <span>Роль: {roleLabel}</span>
                                  </div>
                                  <div className="group-member-actions member-role-controls">
                                    <button className="command-row task-action-button" onClick={() => openEditMemberRoleModal(member)} type="button">
                                      Редактировать
                                    </button>
                                    <button
                                      className="command-row task-action-button group-remove-button"
                                      onClick={() =>
                                        setConfirmDialog({
                                          title: "Исключение участника",
                                          message: "Исключить участника из группы? Профиль сталкера останется в базе.",
                                          confirmLabel: "Исключить",
                                          variant: "warning",
                                          loading: isGroupSaving,
                                          onConfirm: async () => {
                                            await removeSelectedGroupMember(member.id);
                                            setConfirmDialog(null);
                                          },
                                        })
                                      }
                                      type="button"
                                    >
                                      Исключить
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="empty-state compact-empty-state">
                              <p>Участники не добавлены.</p>
                              <span>Добавьте сталкерские профили в состав группы.</span>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="empty-state profile-detail-empty group-detail-empty">
                    <p>Выберите группу из списка слева.</p>
                    <span>Здесь появятся состав, заметки и действия выбранной группы.</span>
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      </section>

      {isGroupModalOpen ? (
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isGroupDraftDirty(), closeGroupModal)}
        >
          <form className="pda-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleGroupSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{editingGroupId ? "Редактирование группы" : "Создание группы"}</h1>
                <p>Группа сохраняется в базе данных</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Основные данные</h2>
                  <span>Название и состояние группы</span>
                </div>
                <div className="group-form-grid">
                  <label className="filter-field">
                    <span>Название</span>
                    <input
                      onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, name: event.target.value }))}
                      placeholder="Например: Северный блок"
                      type="text"
                      value={draft.name}
                    />
                  </label>
                  <label className="filter-field">
                    <span>Изображение группы</span>
                    <input
                      onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, photoUrl: event.target.value }))}
                      placeholder="https://..."
                      type="url"
                      value={draft.photoUrl}
                    />
                  </label>
                  <label className="filter-field">
                    <span>Статус</span>
                    <select
                      onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, status: event.target.value as StalkerGroup["status"] }))}
                      value={draft.status}
                    >
                      <option value="active">Активна</option>
                      <option value="archive">Архив</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Заметки</h2>
                  <span>Контекст, задачи и особенности состава</span>
                </div>
                <label className="filter-field">
                  <span>Заметки</span>
                  <textarea
                    onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, notes: event.target.value }))}
                    placeholder="Заметки о группе, маршрутах, договорённостях"
                    value={draft.notes}
                  />
                </label>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Добавление участника</h2>
                </div>
                <div className="group-member-search-block">
                  {availableProfiles.length > 0 ? (
                    <>
                      <label className="filter-field">
                        <span>Поиск профиля</span>
                        <input
                          onChange={(event) => setMemberSearchQuery(event.target.value)}
                          placeholder="ФИО, позывной, внутренний номер"
                          type="text"
                          value={memberSearchQuery}
                        />
                      </label>
                      {memberSearchQuery.trim() ? (
                        <div className="group-search-results">
                          {memberSearchResults.length > 0 ? (
                            memberSearchResults.map((profile) => (
                              <div className="group-search-result" key={profile.id}>
                                <div>
                                  <strong>{getProfileTitle(profile)}</strong>
                                  {getProfileSecondaryTitle(profile) ? (
                                    <span>{getProfileSecondaryTitle(profile)}</span>
                                  ) : null}
                                  {profile.registryNumber ? (
                                    <span>Внутренний номер: {profile.registryNumber}</span>
                                  ) : null}
                                </div>
                                <button className="command-row task-action-button" onClick={() => addMember(profile.id)} type="button">
                                  Добавить
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="empty-state compact-empty-state">
                              <p>Подходящие профили не найдены.</p>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="empty-state">
                      <p>Профили сталкеров ещё не созданы.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Состав группы</h2>
                </div>
                <div className="group-member-list-editor">
                  {draft.members.length > 0 ? (
                    draft.members.map((member) => {
                      const profile = profileById.get(member.stalkerId);

                      return (
                        <div className="group-member-edit-row" key={member.id}>
                          <div className="group-member-summary">
                            <strong>{profile ? getProfileTitle(profile) : "Профиль не найден"}</strong>
                            {profile && getProfileSecondaryTitle(profile) ? (
                              <span>{getProfileSecondaryTitle(profile)}</span>
                            ) : null}
                          </div>
                          <div className="group-role-fields">
                            <select className="group-role-select" onChange={(event) => updateMemberRole(member.id, event.target.value as StalkerGroupRoleType)} value={member.roleType}>
                              {Object.entries(groupRoleLabels).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            {member.roleType === "custom" ? (
                              <input
                                className="group-role-input"
                                onChange={(event) => updateMemberCustomRole(member.id, event.target.value)}
                                placeholder="Название роли"
                                type="text"
                                value={member.customRoleName ?? ""}
                              />
                            ) : null}
                            <button className="command-row task-action-button group-remove-button" onClick={() => removeMember(member.id)} type="button">
                              Убрать
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty-state">
                      <p>Участники не добавлены.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {formMessage ? <p className="draft-message">{formMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isGroupDraftDirty(), closeGroupModal)}
                type="button"
              >
                Отмена
              </button>
              <button className="primary-command" disabled={isGroupSaving} type="submit">
                {isGroupSaving ? "Сохранение..." : editingGroupId ? "Сохранить изменения" : "Сохранить группу"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isGroupTaskModalOpen && selectedGroup ? (
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isGroupTaskDraftDirty(), closeGroupTaskModal)}
        >
          <form className="pda-modal task-modal journal-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleGroupTaskSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{editingGroupTaskId ? "Редактировать задание группы" : "Выдать задание группе"}</h1>
                <p>Исполнитель: {selectedGroup.name}</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Параметры задания</h2>
                  <span>Сроки, статус, награда и ответственный</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field">
                    <span>Дата выдачи</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateGroupTaskDraft("issuedAt", event.target.value)} type="date" value={groupTaskDraft.issuedAt} />
                  </label>
                  <label className="filter-field">
                    <span>Выполнить до</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updateGroupTaskDraft("dueAt", event.target.value)} type="date" value={groupTaskDraft.dueAt} />
                  </label>
                  <label className="filter-field">
                    <span>Статус выполнения</span>
                    <select onChange={(event) => updateGroupTaskDraft("status", event.target.value as Task["status"])} value={groupTaskDraft.status}>
                      <option value="active">Активно</option>
                      <option value="completed">Выполнено</option>
                      <option value="cancelled">Отменено</option>
                    </select>
                  </label>
                  <label className="filter-field">
                    <span>Награда</span>
                    <input onChange={(event) => updateGroupTaskDraft("reward", event.target.value)} placeholder="Например: 5000 рублей" type="text" value={groupTaskDraft.reward} />
                  </label>
                  <label className="filter-field">
                    <span>Кто выдал</span>
                    <input onChange={(event) => updateGroupTaskDraft("issuedBy", event.target.value)} placeholder="Позывной или должность" type="text" value={groupTaskDraft.issuedBy} />
                  </label>
                  <label className="filter-field">
                    <span>Кто принял выполнение</span>
                    <input onChange={(event) => updateGroupTaskDraft("acceptedBy", event.target.value)} placeholder="Заполняется для выполненного задания" type="text" value={groupTaskDraft.acceptedBy} />
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
                    <textarea onChange={(event) => updateGroupTaskDraft("description", event.target.value)} placeholder="Опишите задачу для группы" value={groupTaskDraft.description} />
                  </label>
                  <label className="filter-field task-form-wide">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateGroupTaskDraft("notes", event.target.value)} placeholder="Дополнительные условия или комментарии" value={groupTaskDraft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {groupTaskFormMessage ? <p className="draft-message">{groupTaskFormMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isGroupTaskDraftDirty(), closeGroupTaskModal)}
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

      {isGroupMemberModalOpen && selectedGroup ? (
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isSelectedGroupMemberDraftDirty(), closeGroupMemberModal)}
        >
          <div className="pda-modal task-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Добавить участника</h1>
                <p>Группа: {selectedGroup.name}</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section group-role-modal-form">
                <div className="form-section-heading">
                  <h2>Профиль и роль</h2>
                  <span>Выберите сталкера и роль участника группы.</span>
                </div>

                {availableProfiles.length > 0 ? (
                  <>
                    <label className="filter-field">
                      <span>Поиск профиля</span>
                      <input
                        onChange={(event) =>
                          {
                            setSelectedGroupMemberDraft((currentDraft) => ({
                              ...currentDraft,
                              searchQuery: event.target.value,
                              profileId: "",
                            }));
                            setMemberFormMessage("");
                          }
                        }
                        placeholder="Введите позывной, ФИО или номер"
                        type="text"
                        value={selectedGroupMemberDraft.searchQuery}
                      />
                    </label>

                    <div className="group-search-results">
                      {!selectedGroupMemberDraft.searchQuery.trim() ? (
                        <div className="empty-state compact-empty-state">
                          <p>Введите данные для поиска.</p>
                        </div>
                      ) : selectedGroupAvailableProfiles.length > 0 ? (
                        selectedGroupAvailableProfiles.map((profile) => (
                          <div className="group-search-result" key={profile.id}>
                            <div>
                              <strong>{getProfileTitle(profile)}</strong>
                              {getProfileSecondaryTitle(profile) ? (
                                <span>{getProfileSecondaryTitle(profile)}</span>
                              ) : null}
                              {profile.registryNumber ? (
                                <span>Внутренний номер: {profile.registryNumber}</span>
                              ) : null}
                            </div>
                            <button
                              className="command-row task-action-button"
                              onClick={() => {
                                setSelectedGroupMemberDraft((currentDraft) => ({
                                  ...currentDraft,
                                  profileId: profile.id,
                                }));
                                setMemberFormMessage("");
                              }}
                              type="button"
                            >
                              Выбрать
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="empty-state compact-empty-state">
                          <p>Профили не найдены.</p>
                        </div>
                      )}
                    </div>

                    <label className="filter-field">
                      <span>Выбранный профиль</span>
                      <input
                        disabled
                        placeholder="Профиль не выбран"
                        type="text"
                        value={selectedGroupMemberProfile ? getProfileTitle(selectedGroupMemberProfile) : ""}
                      />
                    </label>

                    <label className="filter-field">
                      <span>Роль участника</span>
                      <select
                        onChange={(event) => {
                          setSelectedGroupMemberDraft((currentDraft) => ({ ...currentDraft, roleType: event.target.value as StalkerGroupRoleType }));
                          setMemberFormMessage("");
                        }}
                        value={selectedGroupMemberDraft.roleType}
                      >
                        {Object.entries(groupRoleLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedGroupMemberDraft.roleType === "custom" ? (
                      <label className="filter-field">
                        <span>Название роли</span>
                        <input
                          onChange={(event) => {
                            setSelectedGroupMemberDraft((currentDraft) => ({ ...currentDraft, customRoleName: event.target.value }));
                            setMemberFormMessage("");
                          }}
                          placeholder="Название роли"
                          type="text"
                          value={selectedGroupMemberDraft.customRoleName}
                        />
                      </label>
                    ) : null}
                  </>
                ) : (
                  <div className="empty-state">
                    <p>Профили сталкеров ещё не созданы.</p>
                  </div>
                )}
              </section>
            </div>

            <div className="modal-message-slot">
              {memberFormMessage ? <p className="draft-message">{memberFormMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isSelectedGroupMemberDraftDirty(), closeGroupMemberModal)}
                type="button"
              >
                Отмена
              </button>
              <button
                className="primary-command"
                disabled={isGroupSaving || !selectedGroupMemberProfile}
                onClick={addMemberToSelectedGroup}
                type="button"
              >
                {isGroupSaving ? "Добавление..." : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingMemberRoleId && selectedGroup ? (
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isMemberRoleDraftDirty(), closeEditMemberRoleModal)}
        >
          <div className="pda-modal task-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Редактирование роли</h1>
                <p>
                  Участник:{" "}
                  {(() => {
                    const member = selectedGroup.members.find((currentMember) => currentMember.id === editingMemberRoleId);
                    const profile = member ? profileById.get(member.stalkerId) : null;

                    return profile ? getProfileTitle(profile) : "профиль не найден";
                  })()}
                </p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section group-role-modal-form">
                <div className="form-section-heading">
                  <h2>Роль участника</h2>
                  <span>Изменение роли выполняется отдельно от списка состава.</span>
                </div>

                <label className="filter-field">
                  <span>Роль</span>
                  <select
                    onChange={(event) =>
                      setMemberRoleDraft((currentDraft) => ({
                        ...currentDraft,
                        roleType: event.target.value as StalkerGroupRoleType,
                      }))
                    }
                    value={memberRoleDraft.roleType}
                  >
                    {Object.entries(groupRoleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                {memberRoleDraft.roleType === "custom" ? (
                  <label className="filter-field">
                    <span>Название роли</span>
                    <input
                      onChange={(event) =>
                        setMemberRoleDraft((currentDraft) => ({
                          ...currentDraft,
                          customRoleName: event.target.value,
                        }))
                      }
                      placeholder="Название роли"
                      type="text"
                      value={memberRoleDraft.customRoleName}
                    />
                  </label>
                ) : null}
              </section>
            </div>

            <div className="modal-message-slot">
              {memberRoleMessage ? <p className="draft-message">{memberRoleMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isMemberRoleDraftDirty(), closeEditMemberRoleModal)}
                type="button"
              >
                Отмена
              </button>
              <button className="primary-command" disabled={isGroupSaving} onClick={saveSelectedGroupMemberRole} type="button">
                {isGroupSaving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {completingGroupTaskId ? (
        <div
          className="pda-modal-backdrop"
          onMouseDown={(event) => handleModalBackdropMouseDown(event, isCompleteGroupTaskDirty(), closeCompleteGroupTaskModal)}
        >
          <form className="pda-modal task-complete-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submitCompleteGroupTask}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Засчитать групповое задание</h1>
                <p>Укажите, кто принял выполнение задания.</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Подтверждение</h2>
                  <span>Задание перейдёт в выполненные</span>
                </div>
                <label className="filter-field">
                  <span>Кто принял выполнение</span>
                  <input
                    autoFocus
                    onChange={(event) => {
                      setCompleteGroupTaskAcceptedBy(event.target.value);
                      setCompleteGroupTaskMessage("");
                    }}
                    placeholder="Позывной или должность"
                    type="text"
                    value={completeGroupTaskAcceptedBy}
                  />
                </label>
              </section>
            </div>

            <div className="modal-message-slot">
              {completeGroupTaskMessage ? <p className="draft-message">{completeGroupTaskMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button
                className="command-row"
                onClick={() => requestDirtyModalClose(isCompleteGroupTaskDirty(), closeCompleteGroupTaskModal)}
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

      {confirmDialog ? (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          variant={confirmDialog.variant}
          loading={confirmDialog.loading || isGroupSaving || isGroupDeleting}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
        />
      ) : null}
    </main>
  );
}
