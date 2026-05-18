"use client";

/* eslint-disable @next/next/no-img-element */
import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetchJson } from "@/lib/api-client";
import type { UserRole } from "@/lib/auth-roles";
import { cachePolicy, dutyDataKeys, scheduleClientStateSync, TWO_HOURS, useCurrentUserCacheKey, useDutyQueryClient } from "@/lib/data-cache";
import { compareDutyMembersByRankAndName, isDutyMemberVisibleRole } from "@/lib/duty-members";

type DutyServiceStatus = "active" | "leave" | "wounded" | "missing" | "discharged";
type DutyMemberProfileStatus = "active" | "archived";
type DutyAccessFilter = "all" | "with_access" | "without_access" | "blocked";

type DutyMemberAccess = {
  login: string;
  displayName: string | null;
  role: UserRole;
  roleLabel: string;
  accessLevelLabel: string;
  isActive: boolean;
};

type DutyMemberPosition = {
  id: string;
  title: string;
  sectionId: string;
  sectionName: string;
  sortOrder: number;
};

type DutyMember = {
  id: string;
  fullName: string;
  callsign: string | null;
  rank: string | null;
  position: string | null;
  unit: string | null;
  serviceStatus: DutyServiceStatus;
  profileStatus: DutyMemberProfileStatus;
  notes: string | null;
  photoUrl: string | null;
  positions: DutyMemberPosition[];
  access: DutyMemberAccess | null;
};

type CurrentUser = {
  login: string;
  displayName: string | null;
  role: UserRole;
};

type AccessUserOption = {
  login: string;
  displayName: string | null;
  role: UserRole;
  roleLabel: string;
  accessLevelLabel: string;
  isActive: boolean;
  dutyMemberId: string | null;
};

type DutyMemberDraft = {
  accessLevel: "officer" | "regular";
  accessLogin: string;
  callsign: string;
  displayName: string;
  fullName: string;
  login: string;
  notes: string;
  password: string;
  photoUrl: string;
  rank: string;
  repeatPassword: string;
  serviceStatus: DutyServiceStatus;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant: "danger" | "default" | "warning";
  onConfirm: () => Promise<void>;
};

type ResetPasswordState = {
  member: DutyMember;
  newPassword: string;
  repeatPassword: string;
};

const emptyDraft: DutyMemberDraft = {
  accessLevel: "regular",
  accessLogin: "",
  callsign: "",
  displayName: "",
  fullName: "",
  login: "",
  notes: "",
  password: "",
  photoUrl: "",
  rank: "",
  repeatPassword: "",
  serviceStatus: "active",
};

const serviceStatusLabels: Record<DutyServiceStatus, string> = {
  active: "В строю",
  leave: "В резерве",
  wounded: "Временно отстранён",
  missing: "Временно отстранён",
  discharged: "Исключён",
};

const serviceStatusOptions: Array<{ label: string; value: DutyServiceStatus }> = [
  { label: "В строю", value: "active" },
  { label: "В резерве", value: "leave" },
  { label: "Временно отстранён", value: "wounded" },
  { label: "Исключён", value: "discharged" },
];

const accessFilters: Array<{ label: string; value: DutyAccessFilter }> = [
  { label: "Все", value: "all" },
  { label: "С доступом", value: "with_access" },
  { label: "Без доступа", value: "without_access" },
  { label: "Заблокированы", value: "blocked" },
];

const accessLevelOptions: Array<{ label: string; value: "officer" | "regular" }> = [
  { label: "Офицерский допуск", value: "officer" },
  { label: "Базовый допуск", value: "regular" },
];

const activeDutyServiceStatuses: DutyServiceStatus[] = ["active", "leave", "wounded", "missing"];

function isExcludedMember(member: DutyMember) {
  return member.serviceStatus === "discharged";
}

function getMemberPrimaryName(member: DutyMember) {
  return member.fullName || member.callsign || "Без имени";
}

function getAccessStatus(member: DutyMember) {
  if (isExcludedMember(member)) {
    return "Доступ заблокирован";
  }

  if (!member.access) {
    return "Доступ не назначен";
  }

  return member.access.isActive ? "Доступ разрешён" : "Доступ заблокирован";
}

function getAccessLevelLabel(member: DutyMember) {
  return member.access?.accessLevelLabel ?? "Не назначен";
}

function getAccessBadgeClass(member: DutyMember) {
  if (isExcludedMember(member)) {
    return "registry-status-badge-danger";
  }

  if (!member.access) {
    return "registry-status-badge-muted";
  }

  return member.access.isActive ? "registry-status-badge-active" : "registry-status-badge-danger";
}

function getMemberPositionSummary(member: DutyMember) {
  if (member.positions.length === 0) {
    return "Должность не назначена";
  }

  const [firstPosition, ...remainingPositions] = member.positions;
  return remainingPositions.length > 0 ? `${firstPosition.title} + ещё ${remainingPositions.length}` : firstPosition.title;
}

function DutyMemberPhoto({ alt, className = "", src }: { alt: string; className?: string; src: string | null }) {
  const normalizedSrc = src?.trim() ?? "";
  const [failedSrc, setFailedSrc] = useState("");
  const resolvedSrc = normalizedSrc && failedSrc !== normalizedSrc ? normalizedSrc : "/no-data-person.png";
  const isPlaceholder = resolvedSrc === "/no-data-person.png";

  return <img alt={alt} className={isPlaceholder ? `profile-photo-placeholder ${className}`.trim() : className || undefined} onError={() => normalizedSrc && setFailedSrc(normalizedSrc)} src={resolvedSrc} />;
}

function createDraft(member?: DutyMember): DutyMemberDraft {
  if (!member) {
    return emptyDraft;
  }

  return {
    accessLevel: member.access?.role === "officer" ? "officer" : "regular",
    accessLogin: member.access?.login ?? "",
    callsign: member.callsign ?? "",
    displayName: member.access?.displayName ?? "",
    fullName: member.fullName,
    login: member.access?.login ?? "",
    notes: member.notes ?? "",
    password: "",
    photoUrl: member.photoUrl ?? "",
    rank: member.rank ?? "",
    repeatPassword: "",
    serviceStatus: member.serviceStatus === "missing" ? "wounded" : member.serviceStatus,
  };
}

function matchesMemberSearch(member: DutyMember, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");

  if (!normalizedQuery) {
    return true;
  }

  return [
    member.fullName,
    member.callsign,
    member.rank,
    serviceStatusLabels[member.serviceStatus],
    member.access?.login,
    member.access?.displayName,
    member.access?.accessLevelLabel,
    ...member.positions.flatMap((position) => [position.title, position.sectionName]),
  ]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase("ru-RU").includes(normalizedQuery));
}

function matchesAccessFilter(member: DutyMember, filter: DutyAccessFilter) {
  if (filter === "with_access") {
    return !isExcludedMember(member) && Boolean(member.access?.isActive);
  }

  if (filter === "without_access") {
    return !member.access;
  }

  if (filter === "blocked") {
    return isExcludedMember(member) || Boolean(member.access && !member.access.isActive);
  }

  return true;
}

function isAccessBackedMember(member: DutyMember) {
  return Boolean(member.access && isDutyMemberVisibleRole(member.access.role));
}

function getVisibleMembers(members: DutyMember[]) {
  return members.filter(isAccessBackedMember).sort(compareDutyMembersByRankAndName);
}

function getSelectableAccessUsers(users: AccessUserOption[]) {
  return users.filter((user) => isDutyMemberVisibleRole(user.role));
}

function resolveSelectedMemberId(members: DutyMember[], currentId: string | null) {
  if (currentId && members.some((member) => member.id === currentId)) {
    return currentId;
  }

  return members[0]?.id ?? null;
}

function buildMemberPayload(draft: DutyMemberDraft) {
  const isExcluded = draft.serviceStatus === "discharged";

  return {
    accessLogin: draft.accessLogin,
    callsign: draft.callsign,
    fullName: draft.fullName,
    notes: draft.notes,
    photoUrl: draft.photoUrl,
    rank: draft.rank,
    serviceStatus: draft.serviceStatus,
    profileStatus: isExcluded ? "archived" : "active",
  };
}

function buildCreateUserPayload(draft: DutyMemberDraft) {
  return {
    accessLevel: draft.accessLevel,
    displayName: draft.displayName,
    fullName: draft.fullName,
    login: draft.login,
    notes: draft.notes,
    password: draft.password,
    photoUrl: draft.photoUrl,
    rank: draft.rank,
    repeatPassword: draft.repeatPassword,
  };
}

export default function DutyMembersPage() {
  const queryClient = useDutyQueryClient();
  const { currentUser: cachedCurrentUser, currentUserKey, isCurrentUserLoading } = useCurrentUserCacheKey();
  const [members, setMembers] = useState<DutyMember[]>(() =>
    currentUserKey ? getVisibleMembers(queryClient.getQueryData<DutyMember[]>(dutyDataKeys.dutyMembers(currentUserKey)) ?? []) : [],
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessUsers, setAccessUsers] = useState<AccessUserOption[]>(() =>
    currentUserKey ? getSelectableAccessUsers(queryClient.getQueryData<AccessUserOption[]>(dutyDataKeys.dutyAccessUsers(currentUserKey)) ?? []) : [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [accessFilter, setAccessFilter] = useState<DutyAccessFilter>("all");
  const [draft, setDraft] = useState<DutyMemberDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const [resetPasswordState, setResetPasswordState] = useState<ResetPasswordState | null>(null);
  const [resetPasswordMessage, setResetPasswordMessage] = useState("");
  const [isResetPasswordSaving, setIsResetPasswordSaving] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    newPassword: "",
    repeatPassword: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );
  const filteredMembers = useMemo(
    () =>
      members
        .filter((member) => matchesAccessFilter(member, accessFilter))
        .filter((member) => matchesMemberSearch(member, searchQuery))
        .sort(compareDutyMembersByRankAndName),
    [accessFilter, members, searchQuery],
  );
  const activeMembers = useMemo(
    () => filteredMembers.filter((member) => activeDutyServiceStatuses.includes(member.serviceStatus)),
    [filteredMembers],
  );
  const excludedMembers = useMemo(() => filteredMembers.filter(isExcludedMember), [filteredMembers]);
  const canManage = currentUser?.role === "system_admin" || currentUser?.role === "officer";
  const isOwnProfile = Boolean(selectedMember?.access && selectedMember.access.login === currentUser?.login);
  const isSelectedMemberExcluded = Boolean(selectedMember && isExcludedMember(selectedMember));
  const hasSearchOrFilter = Boolean(searchQuery.trim()) || accessFilter !== "all";
  const isEditing = isCreating || Boolean(editingId);
  const availableAccessUsers = useMemo(
    () => accessUsers.filter((user) => isDutyMemberVisibleRole(user.role) && (!user.dutyMemberId || user.dutyMemberId === editingId)),
    [accessUsers, editingId],
  );

  const membersQuery = useQuery({
    queryKey: dutyDataKeys.dutyMembers(currentUserKey ?? "pending"),
    queryFn: () => apiFetchJson<DutyMember[]>("/api/duty-members", undefined, "Не удалось загрузить состав. Повторите попытку позже."),
    enabled: Boolean(currentUserKey),
    gcTime: TWO_HOURS,
    staleTime: cachePolicy.dutyMembers,
  });
  const accessUsersQuery = useQuery({
    queryKey: dutyDataKeys.dutyAccessUsers(currentUserKey ?? "pending"),
    queryFn: () => apiFetchJson<AccessUserOption[]>("/api/duty-members/access-users"),
    enabled: Boolean(currentUserKey) && (cachedCurrentUser?.role === "system_admin" || cachedCurrentUser?.role === "officer"),
    gcTime: TWO_HOURS,
    staleTime: cachePolicy.dutyAccessUsers,
  });

  useEffect(() => {
    let isCancelled = false;

    const loadHandle = window.setTimeout(() => {
      const cachedMembers = currentUserKey ? queryClient.getQueryData<DutyMember[]>(dutyDataKeys.dutyMembers(currentUserKey)) : null;
      const cachedAccessUsers = currentUserKey ? queryClient.getQueryData<AccessUserOption[]>(dutyDataKeys.dutyAccessUsers(currentUserKey)) : null;

      if (cachedCurrentUser) {
        setCurrentUser(cachedCurrentUser as CurrentUser);
      }

      if (cachedMembers) {
        const visibleMembers = getVisibleMembers(cachedMembers);
        setMembers(visibleMembers);
        setSelectedMemberId((currentId) => resolveSelectedMemberId(visibleMembers, currentId));
        setIsLoading(false);

        if (cachedAccessUsers) {
          setAccessUsers(getSelectableAccessUsers(cachedAccessUsers));
        }

        return;
      }

      async function loadInitialData() {
        setIsLoading(true);
        setLoadError("");

        const loadedUser = await apiFetchJson<CurrentUser>("/api/auth/me").catch(() => null);

        if (!isCancelled && loadedUser) {
          setCurrentUser(loadedUser);
        }

        const loadedMembers = await apiFetchJson<DutyMember[]>(
          "/api/duty-members",
          undefined,
          "Не удалось загрузить состав. Повторите попытку позже.",
        ).catch((error) => {
          if (!isCancelled) {
            setLoadError(error instanceof Error ? error.message : "Не удалось загрузить состав. Повторите попытку позже.");
          }

          return null;
        });

        if (!isCancelled && loadedMembers) {
          const visibleMembers = getVisibleMembers(loadedMembers);
          setMembers(visibleMembers);
          if (currentUserKey) {
            queryClient.setQueryData(dutyDataKeys.dutyMembers(currentUserKey), loadedMembers);
          }
          setSelectedMemberId((currentId) => resolveSelectedMemberId(visibleMembers, currentId));
        }

        if (loadedUser?.role === "system_admin" || loadedUser?.role === "officer") {
          const loadedAccessUsers = await apiFetchJson<AccessUserOption[]>("/api/duty-members/access-users").catch(() => []);

          if (!isCancelled) {
            setAccessUsers(getSelectableAccessUsers(loadedAccessUsers));
            if (currentUserKey) {
              queryClient.setQueryData(dutyDataKeys.dutyAccessUsers(currentUserKey), loadedAccessUsers);
            }
          }
        }

        if (!isCancelled) {
          setIsLoading(false);
        }
      }

      void loadInitialData();
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(loadHandle);
    };
  }, [cachedCurrentUser, currentUserKey, queryClient]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (cachedCurrentUser) {
        setCurrentUser(cachedCurrentUser as CurrentUser);
      }
    });
  }, [cachedCurrentUser]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (membersQuery.data) {
        const visibleMembers = getVisibleMembers(membersQuery.data);
        setMembers(visibleMembers);
        setSelectedMemberId((currentId) => resolveSelectedMemberId(visibleMembers, currentId));
      }
    });
  }, [membersQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (accessUsersQuery.data) {
        setAccessUsers(getSelectableAccessUsers(accessUsersQuery.data));
      }
    });
  }, [accessUsersQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      setLoadError(membersQuery.isError ? "Не удалось загрузить состав. Повторите попытку позже." : "");
      setIsLoading(isCurrentUserLoading || (membersQuery.isPending && members.length === 0));
    });
  }, [isCurrentUserLoading, members.length, membersQuery.isError, membersQuery.isPending]);

  useEffect(() => {
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.dutyMembers(currentUserKey), members);
    }
  }, [currentUserKey, members, queryClient]);

  useEffect(() => {
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.dutyAccessUsers(currentUserKey), accessUsers);
    }
  }, [accessUsers, currentUserKey, queryClient]);

  function updateDraft(field: keyof DutyMemberDraft, value: string) {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    setActionMessage("");
  }

  function updateAccessDraft(accessLogin: string) {
    const accessUser = accessUsers.find((user) => user.login === accessLogin);

    setDraft((currentDraft) => ({
      ...currentDraft,
      accessLogin,
      callsign: isCreating && accessUser && !currentDraft.callsign.trim() ? accessUser.login : currentDraft.callsign,
      fullName: isCreating && accessUser && !currentDraft.fullName.trim() ? accessUser.displayName || accessUser.login : currentDraft.fullName,
    }));
    setActionMessage("");
  }

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setDraft(emptyDraft);
    setActionMessage("");
  }

  function startEdit(member: DutyMember) {
    setIsCreating(false);
    setEditingId(member.id);
    setDraft(createDraft(member));
    setActionMessage("");
  }

  function closeForm() {
    setIsCreating(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setActionMessage("");
  }

  async function handleMemberSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      setActionMessage("Доступ к операции запрещён.");
      return;
    }

    if (!isCreating && !draft.accessLogin.trim()) {
      setActionMessage("Выберите учётную запись доступа.");
      return;
    }

    if (isCreating && !draft.login.trim()) {
      setActionMessage("Введите логин.");
      return;
    }

    if (isCreating && !draft.password) {
      setActionMessage("Введите пароль.");
      return;
    }

    if (isCreating && !draft.repeatPassword) {
      setActionMessage("Повторите пароль.");
      return;
    }

    if (isCreating && draft.password !== draft.repeatPassword) {
      setActionMessage("Пароль и повтор не совпадают.");
      return;
    }

    if (isCreating && (draft.password.length < 8 || draft.password.length > 128)) {
      setActionMessage("Пароль должен быть от 8 до 128 символов.");
      return;
    }

    if (!draft.fullName.trim()) {
      setActionMessage("Укажите ФИО.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");

    try {
      const savedMember = await apiFetchJson<DutyMember>(
        editingId ? `/api/duty-members/${editingId}` : "/api/duty-members/users",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingId ? buildMemberPayload(draft) : buildCreateUserPayload(draft)),
        },
      );

      setMembers((currentMembers) => {
        if (editingId) {
          return currentMembers.map((member) => (member.id === savedMember.id ? savedMember : member));
        }

        return getVisibleMembers([savedMember, ...currentMembers]);
      });
      setAccessUsers((currentUsers) =>
        currentUsers.map((user) => ({
          ...user,
          isActive: user.login === savedMember.access?.login ? (savedMember.access?.isActive ?? false) : user.isActive,
          dutyMemberId: user.login === savedMember.access?.login ? savedMember.id : user.dutyMemberId === savedMember.id ? null : user.dutyMemberId,
        })),
      );
      setSelectedMemberId(savedMember.id);
      closeForm();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль.");
    } finally {
      setIsSaving(false);
    }
  }

  function canManageTarget(member: DutyMember) {
    if (!canManage || !currentUser) {
      return false;
    }

    if (member.access?.login === currentUser.login) {
      return false;
    }

    if (currentUser.role === "officer" && member.access?.role === "system_admin") {
      return false;
    }

    return true;
  }

  function requestAccessChange(member: DutyMember, isActive: boolean) {
    setConfirmDialog({
      title: isActive ? "Восстановить доступ?" : "Заблокировать доступ?",
      message: isActive
        ? "Профилю будет возвращён доступ к системе учёта."
        : "Профиль временно потеряет доступ к системе учёта.",
      confirmLabel: isActive ? "Восстановить" : "Заблокировать",
      variant: isActive ? "default" : "warning",
      onConfirm: async () => {
        await changeAccess(member, isActive);
      },
    });
  }

  async function changeAccess(member: DutyMember, isActive: boolean) {
    setIsSaving(true);
    setActionMessage("");

    try {
      const updatedMember = await apiFetchJson<DutyMember>(`/api/duty-members/${member.id}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });

      setMembers((currentMembers) => currentMembers.map((currentMember) => (currentMember.id === updatedMember.id ? updatedMember : currentMember)));
      setAccessUsers((currentUsers) =>
        currentUsers.map((user) => (user.login === updatedMember.access?.login ? { ...user, isActive: updatedMember.access?.isActive ?? false } : user)),
      );
      setConfirmDialog(null);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Не удалось выполнить операцию.");
    } finally {
      setIsSaving(false);
    }
  }

  function requestExclude(member: DutyMember) {
    setConfirmDialog({
      title: "Исключить из состава?",
      message: "Профиль будет переведён в список исключённых. Служебный доступ будет заблокирован.",
      confirmLabel: "Исключить",
      variant: "danger",
      onConfirm: async () => {
        await excludeMember(member);
      },
    });
  }

  async function excludeMember(member: DutyMember) {
    setIsSaving(true);
    setActionMessage("");

    try {
      const updatedMember = await apiFetchJson<DutyMember>(`/api/duty-members/${member.id}`, {
        method: "DELETE",
      });

      setMembers((currentMembers) => currentMembers.map((currentMember) => (currentMember.id === updatedMember.id ? updatedMember : currentMember)));
      setAccessUsers((currentUsers) =>
        currentUsers.map((user) => (user.login === updatedMember.access?.login ? { ...user, isActive: false } : user)),
      );
      setSelectedMemberId(updatedMember.id);
      setConfirmDialog(null);
      closeForm();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Не удалось выполнить операцию.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedMember && isExcludedMember(selectedMember)) {
      setPasswordMessage("Доступ к операции запрещён.");
      return;
    }

    setIsPasswordSaving(true);
    setPasswordMessage("");

    try {
      const response = await apiFetchJson<{ message: string }>("/api/duty-members/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordDraft),
      });

      setPasswordDraft({ currentPassword: "", newPassword: "", repeatPassword: "" });
      setPasswordMessage(response.message);
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Пароль не изменён. Проверьте введённые данные.");
    } finally {
      setIsPasswordSaving(false);
    }
  }

  function openResetPassword(member: DutyMember) {
    if (isExcludedMember(member)) {
      setActionMessage("Доступ к операции запрещён.");
      return;
    }

    setResetPasswordState({
      member,
      newPassword: "",
      repeatPassword: "",
    });
    setResetPasswordMessage("");
  }

  function closeResetPassword() {
    setResetPasswordState(null);
    setResetPasswordMessage("");
  }

  async function handleResetPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!resetPasswordState) {
      return;
    }

    if (isExcludedMember(resetPasswordState.member)) {
      setResetPasswordMessage("Доступ к операции запрещён.");
      return;
    }

    setIsResetPasswordSaving(true);
    setResetPasswordMessage("");

    try {
      const response = await apiFetchJson<{ message: string }>(`/api/duty-members/${resetPasswordState.member.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: resetPasswordState.newPassword,
          repeatPassword: resetPasswordState.repeatPassword,
        }),
      });

      setActionMessage(response.message);
      closeResetPassword();
    } catch (error) {
      setResetPasswordMessage(error instanceof Error ? error.message : "Пароль не изменён. Проверьте введённые данные.");
    } finally {
      setIsResetPasswordSaving(false);
    }
  }

  function renderMemberForm() {
    if (!isEditing) {
      return null;
    }

    const normalizedPhotoUrl = draft.photoUrl.trim();

    return (
      <div className="pda-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeForm()}>
        <form className="pda-modal duty-member-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleMemberSubmit}>
          <div className="section-header modal-header">
            <div className="min-w-0">
              <span className="eyebrow-text">{editingId ? "Изменение профиля" : "Новый пользователь"}</span>
              <h1>{editingId ? "Редактирование профиля состава" : "Добавление пользователя"}</h1>
            </div>
          </div>
          <div className="modal-body duty-member-modal-body">
            <div className="duty-member-form-grid">
              {isCreating ? (
                <>
                  <label className="filter-field">
                    <span>Логин</span>
                    <input autoComplete="username" disabled={isSaving} maxLength={64} onChange={(event) => updateDraft("login", event.target.value)} value={draft.login} />
                  </label>
                  <label className="filter-field">
                    <span>Отображаемое имя</span>
                    <input disabled={isSaving} maxLength={120} onChange={(event) => updateDraft("displayName", event.target.value)} value={draft.displayName} />
                  </label>
                </>
              ) : null}
              <label className="filter-field duty-member-form-wide">
                <span>ФИО</span>
                <input disabled={isSaving} maxLength={120} onChange={(event) => updateDraft("fullName", event.target.value)} value={draft.fullName} />
              </label>
              {!isCreating ? (
                <label className="filter-field">
                  <span>Позывной</span>
                  <input disabled={isSaving} maxLength={80} onChange={(event) => updateDraft("callsign", event.target.value)} value={draft.callsign} />
                </label>
              ) : null}
              <label className="filter-field">
                <span>Звание</span>
                <input disabled={isSaving} maxLength={80} onChange={(event) => updateDraft("rank", event.target.value)} value={draft.rank} />
              </label>
              {isCreating ? (
                <label className="filter-field">
                  <span>Уровень допуска</span>
                  <select disabled={isSaving} onChange={(event) => updateDraft("accessLevel", event.target.value)} value={draft.accessLevel}>
                    {accessLevelOptions.map((accessLevel) => (
                      <option key={accessLevel.value} value={accessLevel.value}>
                        {accessLevel.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="filter-field">
                    <span>Статус состава</span>
                    <select disabled={isSaving} onChange={(event) => updateDraft("serviceStatus", event.target.value)} value={draft.serviceStatus}>
                      {serviceStatusOptions.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter-field">
                    <span>Учётная запись доступа</span>
                    <select disabled={isSaving} onChange={(event) => updateAccessDraft(event.target.value)} value={draft.accessLogin}>
                      <option disabled value="">
                        Выберите учётную запись доступа
                      </option>
                      {availableAccessUsers.map((user) => (
                        <option key={user.login} value={user.login}>
                          {user.displayName || user.login} · {user.accessLevelLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {isCreating ? (
                <>
                  <label className="filter-field">
                    <span>Пароль</span>
                    <input autoComplete="new-password" disabled={isSaving} onChange={(event) => updateDraft("password", event.target.value)} type="password" value={draft.password} />
                  </label>
                  <label className="filter-field">
                    <span>Повтор пароля</span>
                    <input autoComplete="new-password" disabled={isSaving} onChange={(event) => updateDraft("repeatPassword", event.target.value)} type="password" value={draft.repeatPassword} />
                  </label>
                </>
              ) : null}
              <label className="filter-field duty-member-form-wide">
                <span>Фотография</span>
                <input disabled={isSaving} maxLength={500} onChange={(event) => updateDraft("photoUrl", event.target.value)} placeholder="Например: https://..." type="url" value={draft.photoUrl} />
              </label>
              <div className="profile-photo-preview duty-member-photo-preview">
                <span className="profile-photo-title">Фото профиля</span>
                <div className="profile-photo-frame">
                  <DutyMemberPhoto alt="Фотография профиля состава" src={normalizedPhotoUrl} />
                </div>
              </div>
              <label className="filter-field duty-member-form-wide">
                <span>Заметки</span>
                <textarea disabled={isSaving} maxLength={1000} onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
              </label>
            </div>
            {actionMessage ? <p className="draft-message">{actionMessage}</p> : null}
          </div>
          <div className="modal-actions duty-member-form-actions">
          <button className="command-row interactive-button" disabled={isSaving} onClick={closeForm} type="button">
            Отмена
          </button>
          <button className="primary-command interactive-button" disabled={isSaving} type="submit">
            {isSaving ? "Сохранение..." : isCreating ? "Создать пользователя" : "Сохранить профиль"}
          </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <main className="pda-page duty-members-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Состав" activeSubtabLabel="Профили состава" />

        <div className="pda-content duty-members-content">
          <section className="duty-members-shell">
            <section className="duty-members-layout">
              <div className="registry-panel registry-panel-list duty-members-list-panel">
                <div className="registry-panel duty-members-list-controls">
                  <div className="duty-member-search-filter-row">
                    <label className="filter-field">
                      <span>Поиск по составу</span>
                      <input onChange={(event) => setSearchQuery(event.target.value)} placeholder="ФИО, звание или доступ" type="search" value={searchQuery} />
                    </label>
                    <label className="filter-field duty-member-access-filter">
                      <span>Фильтр доступа</span>
                      <select onChange={(event) => setAccessFilter(event.target.value as DutyAccessFilter)} value={accessFilter}>
                        {accessFilters.map((filter) => (
                          <option key={filter.value} value={filter.value}>
                            {filter.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {canManage ? (
                    <button className="primary-command interactive-button duty-member-add-button" onClick={startCreate} type="button">
                      Добавить пользователя
                    </button>
                  ) : null}
                </div>

                {isLoading ? <p className="empty-state">Загрузка состава...</p> : null}
                {!isLoading && loadError ? <p className="draft-message">{loadError}</p> : null}
                {!isLoading && !loadError && members.length === 0 ? <p className="empty-state">Профили состава пока не добавлены.</p> : null}
                {!isLoading && !loadError && members.length > 0 && activeMembers.length === 0 && excludedMembers.length === 0 ? <p className="empty-state">Профили не найдены.</p> : null}
                {!isLoading && !loadError && activeMembers.length > 0 ? (
                  <div className="duty-member-list-section">
                    <div className="duty-member-list">
                      {activeMembers.map((member) => (
                        <button
                          aria-pressed={selectedMemberId === member.id}
                          className={selectedMemberId === member.id ? "duty-member-list-row duty-member-list-row-active" : "duty-member-list-row"}
                          key={member.id}
                          onClick={() => {
                            setSelectedMemberId(member.id);
                            closeForm();
                          }}
                          type="button"
                        >
                          <span className="duty-member-list-copy">
                            <span className="duty-member-list-head">
                              <strong className="duty-member-list-name">{getMemberPrimaryName(member)}</strong>
                            </span>
                            {member.rank ? <span className="duty-member-list-line">Звание: {member.rank}</span> : null}
                            <span className="duty-member-list-line duty-member-position-preview">{getMemberPositionSummary(member)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!isLoading && !loadError && members.length > 0 && activeMembers.length === 0 && excludedMembers.length > 0 && !hasSearchOrFilter ? (
                  <p className="empty-state">Действующих профилей нет.</p>
                ) : null}
                {!isLoading && !loadError && members.some(isExcludedMember) && (excludedMembers.length > 0 || !hasSearchOrFilter) ? (
                  <div className="duty-member-list-section duty-member-list-section-archived">
                    <div className="block-heading-row duty-member-list-section-heading">
                      <h2>Исключённые из состава</h2>
                    </div>
                    {excludedMembers.length > 0 ? (
                      <div className="duty-member-list duty-member-list-archived">
                        {excludedMembers.map((member) => (
                          <button
                            aria-pressed={selectedMemberId === member.id}
                            className={selectedMemberId === member.id ? "duty-member-list-row duty-member-list-row-active" : "duty-member-list-row"}
                            key={member.id}
                            onClick={() => {
                              setSelectedMemberId(member.id);
                              closeForm();
                            }}
                            type="button"
                          >
                            <span className="duty-member-list-copy">
                              <span className="duty-member-list-head">
                                <strong className="duty-member-list-name">{getMemberPrimaryName(member)}</strong>
                              </span>
                              {member.rank ? <span className="duty-member-list-line">Звание: {member.rank}</span> : null}
                              <span className="duty-member-list-line duty-member-position-preview">{getMemberPositionSummary(member)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">Исключённые профили не найдены.</p>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="registry-panel registry-panel-detail duty-member-detail-panel">
                {actionMessage ? <p className="draft-message">{actionMessage}</p> : null}

                {!isEditing && selectedMember ? (
                  <article className="duty-member-profile">
                    <div className="profile-detail duty-member-detail-card">
                      <div className={canManage ? "profile-hero duty-member-hero duty-member-hero-with-actions" : "profile-hero duty-member-hero"}>
                        <div className="profile-hero-photo duty-member-hero-photo">
                          <DutyMemberPhoto alt="Фотография профиля состава" src={selectedMember.photoUrl} />
                        </div>

                        <div className="profile-hero-main">
                          <div className="profile-hero-head">
                            <div className="profile-hero-badges">
                              <span className="profile-badge badge-chip">{serviceStatusLabels[selectedMember.serviceStatus]}</span>
                              <span className={`profile-badge badge-chip ${getAccessBadgeClass(selectedMember)}`}>{getAccessStatus(selectedMember)}</span>
                            </div>
                            <div className="profile-hero-identity">
                              <h1 className="profile-hero-title">{getMemberPrimaryName(selectedMember)}</h1>
                              <div className="duty-member-hero-lines">
                                <p>{selectedMember.rank ? `Звание: ${selectedMember.rank}` : "Звание не указано"}</p>
                                <p>{`Уровень допуска: ${getAccessLevelLabel(selectedMember)}`}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {canManage ? (
                          <div className="duty-member-hero-actions">
                            <button className="command-row interactive-button duty-member-action-button" onClick={() => startEdit(selectedMember)} type="button">
                              Изменить профиль
                            </button>
                            {!isSelectedMemberExcluded && selectedMember.access?.isActive ? (
                              <button className="command-row interactive-button duty-member-action-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestAccessChange(selectedMember, false)} type="button">
                                Временно заблокировать доступ
                              </button>
                            ) : !isSelectedMemberExcluded && selectedMember.access ? (
                              <button className="command-row interactive-button duty-member-action-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestAccessChange(selectedMember, true)} type="button">
                                Восстановить доступ
                              </button>
                            ) : !isSelectedMemberExcluded ? (
                              <span className="registry-status-badge-muted">Доступ не назначен</span>
                            ) : null}
                            {!isSelectedMemberExcluded ? (
                              <button className="command-row interactive-button duty-member-action-button" disabled={!canManageTarget(selectedMember)} onClick={() => openResetPassword(selectedMember)} type="button">
                                Сбросить пароль
                              </button>
                            ) : null}
                            {!isSelectedMemberExcluded ? (
                              <button className="primary-command interactive-button duty-member-action-button duty-member-danger-action" disabled={!canManageTarget(selectedMember)} onClick={() => requestExclude(selectedMember)} type="button">
                                Исключить из состава
                              </button>
                            ) : null}
                            {isSelectedMemberExcluded ? <span className="registry-status-badge-muted">Пароль и доступ недоступны для исключённого профиля.</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="profile-detail-block duty-member-profile-section">
                      <div className="block-heading-row">
                        <h2>Основные сведения</h2>
                      </div>
                      <dl className="registry-info-grid">
                        <div className="registry-info-field">
                          <dt>ФИО</dt>
                          <dd>{selectedMember.fullName || "Не указано"}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Звание</dt>
                          <dd>{selectedMember.rank || "Не указано"}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Статус состава</dt>
                          <dd>{serviceStatusLabels[selectedMember.serviceStatus]}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Уровень допуска</dt>
                          <dd>{getAccessLevelLabel(selectedMember)}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="profile-detail-block duty-member-profile-section">
                      <div className="block-heading-row">
                        <h2>Должности</h2>
                      </div>
                      {selectedMember.positions.length > 0 ? (
                        <div className="duty-position-list">
                          {selectedMember.positions.map((position) => (
                            <div className="duty-position-row" key={position.id}>
                              <strong>{position.title}</strong>
                              <span>{position.sectionName}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-state">Назначения отсутствуют.</p>
                      )}
                    </div>

                    <div className="profile-detail-block duty-member-profile-section">
                      <div className="block-heading-row">
                        <h2>Заметки</h2>
                      </div>
                      <p className="duty-member-notes">{selectedMember.notes || "Заметок нет."}</p>
                    </div>

                    {isOwnProfile && !isSelectedMemberExcluded ? (
                      <form className="profile-detail-block duty-member-profile-section duty-password-form" onSubmit={handlePasswordSubmit}>
                        <div className="block-heading-row">
                          <h2>Смена пароля</h2>
                        </div>
                        <div className="duty-password-grid">
                          <label className="filter-field duty-password-field duty-password-field-wide">
                            <span>Текущий пароль</span>
                            <input autoComplete="current-password" onChange={(event) => setPasswordDraft((current) => ({ ...current, currentPassword: event.target.value }))} type="password" value={passwordDraft.currentPassword} />
                          </label>
                          <div className="duty-password-row">
                            <label className="filter-field duty-password-field">
                              <span>Новый пароль</span>
                              <input autoComplete="new-password" onChange={(event) => setPasswordDraft((current) => ({ ...current, newPassword: event.target.value }))} type="password" value={passwordDraft.newPassword} />
                            </label>
                            <label className="filter-field duty-password-field">
                              <span>Повтор нового пароля</span>
                              <input autoComplete="new-password" onChange={(event) => setPasswordDraft((current) => ({ ...current, repeatPassword: event.target.value }))} type="password" value={passwordDraft.repeatPassword} />
                            </label>
                          </div>
                        </div>
                        {passwordMessage ? <p className="draft-message">{passwordMessage}</p> : null}
                        <div className="modal-actions duty-member-form-actions">
                          <button className="primary-command interactive-button" disabled={isPasswordSaving} type="submit">
                            {isPasswordSaving ? "Сохранение..." : "Сменить пароль"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                ) : null}

                {!isEditing && !selectedMember && !isLoading && !loadError ? (
                  <div className="empty-state profile-detail-empty">
                    <p>{canManage ? "Выберите профиль состава или добавьте новый." : "Выберите профиль состава."}</p>
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        </div>
      </section>

      {renderMemberForm()}

      {resetPasswordState ? (
        <div className="pda-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeResetPassword()}>
          <form className="pda-modal duty-member-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleResetPasswordSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <span className="eyebrow-text">Служебный доступ</span>
                <h1>Сбросить пароль</h1>
              </div>
            </div>
            <div className="modal-body duty-member-modal-body">
              <p className="draft-message">Новый пароль будет установлен для выбранной учётной записи доступа.</p>
              <div className="duty-member-form-grid">
                <label className="filter-field">
                  <span>Новый пароль</span>
                  <input
                    autoComplete="new-password"
                    disabled={isResetPasswordSaving}
                    onChange={(event) => setResetPasswordState((current) => (current ? { ...current, newPassword: event.target.value } : current))}
                    type="password"
                    value={resetPasswordState.newPassword}
                  />
                </label>
                <label className="filter-field">
                  <span>Повтор нового пароля</span>
                  <input
                    autoComplete="new-password"
                    disabled={isResetPasswordSaving}
                    onChange={(event) => setResetPasswordState((current) => (current ? { ...current, repeatPassword: event.target.value } : current))}
                    type="password"
                    value={resetPasswordState.repeatPassword}
                  />
                </label>
              </div>
              {resetPasswordMessage ? <p className="draft-message">{resetPasswordMessage}</p> : null}
            </div>
            <div className="modal-actions duty-member-form-actions">
              <button className="command-row interactive-button" disabled={isResetPasswordSaving} onClick={closeResetPassword} type="button">
                Отмена
              </button>
              <button className="primary-command interactive-button" disabled={isResetPasswordSaving} type="submit">
                {isResetPasswordSaving ? "Сохранение..." : "Сбросить пароль"}
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
          cancelLabel="Отмена"
          variant={confirmDialog.variant}
          loading={isSaving}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
        />
      ) : null}
    </main>
  );
}
