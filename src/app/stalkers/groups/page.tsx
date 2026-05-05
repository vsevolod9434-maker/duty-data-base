"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { getTaskActionVisibility, TaskRecordCard } from "@/components/ui/TaskRecordCard";
import { addActivityLogEntry } from "@/lib/activity-log";
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

export default function StalkerGroupsPage() {
  const [profiles, setProfiles] = useState<StalkerProfile[]>([]);
  const [groups, setGroups] = useState<StalkerGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isStorageReady, setIsStorageReady] = useState(false);
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

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  useEffect(() => {
    const storageReadHandle = window.setTimeout(() => {
      setProfiles(readStoredCollection<StalkerProfile>(STALKER_PROFILES_STORAGE_KEY, initialStalkerProfiles));
      setGroups(readStoredCollection<StalkerGroup>(STALKER_GROUPS_STORAGE_KEY, initialStalkerGroups));
      setTasks(readStoredCollection<Task>(STALKER_TASKS_STORAGE_KEY, initialTasks));
      setIsStorageReady(true);
    }, 0);

    return () => window.clearTimeout(storageReadHandle);
  }, []);

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

  const paginatedGroups = getPaginatedItems(visibleGroups, groupPage);
  const visibleGroupCount = isStorageReady ? visibleGroups.length : 0;
  const shownGroupCount = isStorageReady ? paginatedGroups.items.length : 0;
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
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
  const availableProfiles = profiles.filter((profile) => profile.status === "active");
  const selectedGroupAvailableProfiles = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    const selectedMemberIds = new Set(selectedGroup.members.map((member) => member.stalkerId));

    return availableProfiles.filter((profile) => !selectedMemberIds.has(profile.id));
  }, [availableProfiles, selectedGroup]);
  const memberSearchResults = useMemo(() => {
    const query = memberSearchQuery.trim().toLowerCase();
    const selectedMemberIds = new Set(draft.members.map((member) => member.stalkerId));

    if (!query) {
      return [];
    }

    return availableProfiles
      .filter((profile) => !selectedMemberIds.has(profile.id))
      .filter((profile) =>
        [profile.fullName, profile.callsign, profile.registryNumber]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
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

  function addMemberToSelectedGroup() {
    if (!selectedGroup) {
      return;
    }

    const profileId = selectedGroupMemberDraft.profileId;
    const customRoleName = selectedGroupMemberDraft.customRoleName.trim();
    const profile = profileById.get(profileId);

    if (!profileId) {
      setMemberFormMessage("Выберите сталкерский профиль.");
      return;
    }

    if (selectedGroupMemberDraft.roleType === "custom" && !customRoleName) {
      setMemberFormMessage("Укажите название роли.");
      return;
    }

    const now = getSystemTimestamp();

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === selectedGroup.id
          ? {
              ...group,
              members: [
                ...group.members,
                {
                  id: `member-${profileId}-${Date.now()}`,
                  stalkerId: profileId,
                  roleType: selectedGroupMemberDraft.roleType,
                  customRoleName: selectedGroupMemberDraft.roleType === "custom" ? customRoleName : null,
                  joinedAt: now,
                },
              ],
              updatedAt: now,
            }
          : group,
      ),
    );
    closeGroupMemberModal();
    addActivityLogEntry({
      type: "group",
      title: `Сталкер добавлен в группу: ${selectedGroup.name}`,
      status: "OK",
      description: profile ? getProfileTitle(profile) : profileId,
    });
    setTableMessage("Участник добавлен в группу.");
  }

  function saveSelectedGroupMemberRole() {
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

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === selectedGroupId
          ? {
              ...group,
              members: group.members.map((member) =>
                member.id === editingMemberRoleId
                  ? {
                      ...member,
                      roleType: memberRoleDraft.roleType,
                      customRoleName: memberRoleDraft.roleType === "custom" ? customRoleName : null,
                    }
                  : member,
              ),
              updatedAt: getSystemTimestamp(),
            }
          : group,
      ),
    );
    closeEditMemberRoleModal();
    setTableMessage("Роль участника обновлена.");
    addActivityLogEntry({
      type: "group",
      title: `Изменена роль участника группы: ${selectedGroup.name}`,
      status: "OK",
      description: profile ? getProfileTitle(profile) : "Профиль не найден",
    });
  }

  function removeSelectedGroupMember(memberId: string) {
    const member = selectedGroup?.members.find((currentMember) => currentMember.id === memberId);
    const profile = member ? profileById.get(member.stalkerId) : null;

    if (!window.confirm("Исключить участника из группы? Профиль сталкера останется в базе.")) {
      return;
    }

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === selectedGroupId
          ? {
              ...group,
              members: group.members.filter((member) => member.id !== memberId),
              updatedAt: getSystemTimestamp(),
            }
          : group,
      ),
    );
    setTableMessage("Участник исключён из группы.");
    if (selectedGroup) {
      addActivityLogEntry({
        type: "group",
        title: `Сталкер удалён из группы: ${selectedGroup.name}`,
        status: "WARN",
        description: profile ? getProfileTitle(profile) : "Профиль не найден",
      });
    }
  }

  function handleGroupSubmit(event: React.FormEvent<HTMLFormElement>) {
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

    const now = getSystemTimestamp();
    const normalizedMembers = draft.members.map((member) => ({
      ...member,
      customRoleName:
        member.roleType === "custom" ? member.customRoleName?.trim() || null : null,
    }));

    if (editingGroupId) {
      setGroups((currentGroups) =>
        currentGroups.map((group) =>
          group.id === editingGroupId
            ? {
                ...group,
                name,
                photoUrl: photoUrl || undefined,
                notes: draft.notes.trim(),
                status: draft.status,
                members: normalizedMembers,
                updatedAt: now,
              }
            : group,
        ),
      );
      setGroupListTab(draft.status);
      setTableMessage("Группа обновлена и сохранена локально.");
      addActivityLogEntry({
        type: "group",
        title: `Изменена группа: ${name}`,
        status: "OK",
      });
    } else {
      const newGroup: StalkerGroup = {
        id: `temp-group-${Date.now()}`,
        name,
        photoUrl: photoUrl || undefined,
        notes: draft.notes.trim(),
        status: draft.status,
        members: normalizedMembers,
        createdAt: now,
        updatedAt: now,
      };

      setGroups((currentGroups) => [newGroup, ...currentGroups]);
      setSelectedGroupId(newGroup.id);
      setActiveGroupTab("Состав");
      setGroupListTab(newGroup.status);
      setTableMessage("Группа создана и сохранена локально.");
      addActivityLogEntry({
        type: "group",
        title: `Создана группа: ${name}`,
        status: "OK",
      });
    }

    setGroupPage(1);
    closeGroupModal();
  }

  function setGroupStatus(groupId: string, status: StalkerGroup["status"]) {
    const group = groups.find((currentGroup) => currentGroup.id === groupId);

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? { ...group, status, updatedAt: getSystemTimestamp() }
          : group,
      ),
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
          ? `Группа перенесена в архив: ${group?.name ?? "Без названия"}`
          : `Группа возвращена из архива: ${group?.name ?? "Без названия"}`,
      status: status === "archive" ? "WARN" : "OK",
    });
  }

  function deleteGroup(groupId: string) {
    const group = groups.find((currentGroup) => currentGroup.id === groupId);

    if (!window.confirm("Удалить группу окончательно? Профили участников останутся.")) {
      return;
    }

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

  function handleGroupTaskSubmit(event: FormEvent<HTMLFormElement>) {
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

    const now = getSystemTimestamp();

    if (editingGroupTaskId) {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === editingGroupTaskId
            ? {
                ...task,
                issuedAt: groupTaskDraft.issuedAt,
                dueAt: groupTaskDraft.dueAt,
                description,
                reward: groupTaskDraft.reward.trim(),
                notes: groupTaskDraft.notes.trim(),
                issuedBy: groupTaskDraft.issuedBy.trim(),
                acceptedBy: groupTaskDraft.status === "completed" ? acceptedBy : null,
                completedAt: groupTaskDraft.status === "completed" ? task.completedAt ?? now : null,
                status: groupTaskDraft.status,
                updatedAt: now,
              }
            : task,
        ),
      );
      setTableMessage("Групповое задание обновлено.");
      addActivityLogEntry({
        type: "task",
        title: `Групповое задание изменено: ${selectedGroup.name} — ${description}`,
        status: "OK",
      });
      closeGroupTaskModal();
      return;
    }

    const newTask: Task = {
      id: `group-task-${selectedGroup.id}-${Date.now()}`,
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
      completedAt: groupTaskDraft.status === "completed" ? now : null,
      status: groupTaskDraft.status,
      createdAt: now,
      updatedAt: now,
    };

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
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    const acceptedBy = window.prompt("Кто принял выполнение задания?");

    if (acceptedBy === null) {
      return;
    }

    const normalizedAcceptedBy = acceptedBy.trim();

    if (!normalizedAcceptedBy) {
      setTableMessage("Укажите, кто принял выполнение задания.");
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              acceptedBy: normalizedAcceptedBy,
              completedAt: getSystemTimestamp(),
              status: "completed",
              updatedAt: getSystemTimestamp(),
            }
          : task,
      ),
    );
    setTableMessage("Групповое задание засчитано.");
    addActivityLogEntry({
      type: "task",
      title: `Групповое задание выполнено: ${selectedGroup?.name ?? "Группа не найдена"} — ${task?.description ?? "Без описания"}`,
      status: "OK",
    });
  }

  function openGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setActiveGroupTab("Состав");
  }

  function cancelGroupTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId ? { ...task, status: "cancelled", updatedAt: getSystemTimestamp() } : task,
      ),
    );
    setTableMessage("Групповое задание отменено.");
    addActivityLogEntry({
      type: "task",
      title: `Групповое задание отменено: ${selectedGroup?.name ?? "Группа не найдена"} — ${task?.description ?? "Без описания"}`,
      status: "WARN",
    });
  }

  function deleteGroupTask(taskId: string) {
    const task = tasks.find((currentTask) => currentTask.id === taskId);

    if (!window.confirm("Удалить групповое задание окончательно?")) {
      return;
    }

    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
    setTableMessage("Групповое задание удалено.");
    addActivityLogEntry({
      type: "task",
      title: `Групповое задание удалено: ${selectedGroup?.name ?? "Группа не найдена"} — ${task?.description ?? "Без описания"}`,
      status: "WARN",
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

                {tableMessage ? <p className="table-message">{tableMessage}</p> : null}

                <div className="profile-list">
                  {!isStorageReady ? (
                    <div className="empty-state">
                      <p>Загрузка локальных данных...</p>
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

                {isStorageReady ? (
                  <Pagination page={paginatedGroups.page} pageCount={paginatedGroups.pageCount} onPageChange={setGroupPage} />
                ) : null}
              </section>

              <section className="profile-column detail-host-column">
                {!isStorageReady ? (
                  <div className="empty-state">
                    <p>Загрузка локальных данных...</p>
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
                        <button className="command-row task-action-button" onClick={() => openEditGroup(selectedGroup)} type="button">
                          Редактировать
                        </button>
                        {selectedGroup.status === "active" ? (
                          <button className="command-row task-action-button" onClick={() => setGroupStatus(selectedGroup.id, "archive")} type="button">
                            В архив
                          </button>
                        ) : (
                          <button className="command-row task-action-button" onClick={() => setGroupStatus(selectedGroup.id, "active")} type="button">
                            Вернуть из архива
                          </button>
                        )}
                        <button className="command-row task-action-button" onClick={() => deleteGroup(selectedGroup.id)} type="button">
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
                                    <button className="command-row task-action-button group-remove-button" onClick={() => removeSelectedGroupMember(member.id)} type="button">
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
        <div className="pda-modal-backdrop">
          <form className="pda-modal" onSubmit={handleGroupSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{editingGroupId ? "Редактирование группы" : "Создание группы"}</h1>
                <p>Группа сохраняется локально в браузере</p>
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
                    <span>Ссылка на изображение группы</span>
                    <input
                      onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, photoUrl: event.target.value }))}
                      placeholder="Ссылка на изображение группы"
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
              <button className="command-row" onClick={closeGroupModal} type="button">
                Отмена
              </button>
              <button className="primary-command" type="submit">
                {editingGroupId ? "Сохранить изменения" : "Сохранить группу"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isGroupTaskModalOpen && selectedGroup ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal journal-modal" onSubmit={handleGroupTaskSubmit}>
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
              <button className="command-row" onClick={closeGroupTaskModal} type="button">
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
        <div className="pda-modal-backdrop">
          <div className="pda-modal task-modal">
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

                {selectedGroupAvailableProfiles.length > 0 ? (
                  <>
                    <label className="filter-field">
                      <span>Сталкерский профиль</span>
                      <select
                        onChange={(event) => setSelectedGroupMemberDraft((currentDraft) => ({ ...currentDraft, profileId: event.target.value }))}
                        value={selectedGroupMemberDraft.profileId}
                      >
                        <option value="">Выберите профиль</option>
                        {selectedGroupAvailableProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {getProfileTitle(profile)}
                            {getProfileSecondaryTitle(profile) ? ` — ${getProfileSecondaryTitle(profile)}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="filter-field">
                      <span>Роль участника</span>
                      <select
                        onChange={(event) => setSelectedGroupMemberDraft((currentDraft) => ({ ...currentDraft, roleType: event.target.value as StalkerGroupRoleType }))}
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
                          onChange={(event) => setSelectedGroupMemberDraft((currentDraft) => ({ ...currentDraft, customRoleName: event.target.value }))}
                          placeholder="Название роли"
                          type="text"
                          value={selectedGroupMemberDraft.customRoleName}
                        />
                      </label>
                    ) : null}
                  </>
                ) : (
                  <div className="empty-state">
                    <p>Активные профили сталкеров для добавления не найдены.</p>
                  </div>
                )}
              </section>
            </div>

            <div className="modal-message-slot">
              {memberFormMessage ? <p className="draft-message">{memberFormMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeGroupMemberModal} type="button">
                Отмена
              </button>
              <button className="primary-command" onClick={addMemberToSelectedGroup} type="button">
                Добавить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingMemberRoleId && selectedGroup ? (
        <div className="pda-modal-backdrop">
          <div className="pda-modal task-modal">
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
              <button className="command-row" onClick={closeEditMemberRoleModal} type="button">
                Отмена
              </button>
              <button className="primary-command" onClick={saveSelectedGroupMemberRole} type="button">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

