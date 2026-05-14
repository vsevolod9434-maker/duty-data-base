"use client";

/* eslint-disable @next/next/no-img-element */
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetchJson } from "@/lib/api-client";
import { getRoleLabel, type UserRole } from "@/lib/auth-roles";

type DutyServiceStatus = "active" | "leave" | "wounded" | "missing" | "discharged";
type DutyMemberProfileStatus = "active" | "archived";
type DutyAccessFilter = "all" | "with_access" | "without_access" | "blocked";

type DutyMemberAccess = {
  login: string;
  displayName: string | null;
  role: UserRole;
  roleLabel: string;
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
  isActive: boolean;
  dutyMemberId: string | null;
};

type DutyMemberDraft = {
  accessLogin: string;
  callsign: string;
  fullName: string;
  notes: string;
  photoUrl: string;
  rank: string;
  serviceStatus: DutyServiceStatus;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant: "danger" | "default" | "warning";
  onConfirm: () => Promise<void>;
};

const emptyDraft: DutyMemberDraft = {
  accessLogin: "",
  callsign: "",
  fullName: "",
  notes: "",
  photoUrl: "",
  rank: "",
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

function getMemberPrimaryName(member: DutyMember) {
  return member.fullName || member.callsign || "Без имени";
}

function getMemberSecondaryName(member: DutyMember) {
  return member.callsign ? member.callsign : "";
}

function getAccessStatus(member: DutyMember) {
  if (!member.access) {
    return "Доступ не назначен";
  }

  return member.access.isActive ? "Доступ разрешён" : "Доступ заблокирован";
}

function getAccessBadgeClass(member: DutyMember) {
  if (!member.access) {
    return "registry-status-badge-muted";
  }

  return member.access.isActive ? "registry-status-badge-active" : "registry-status-badge-danger";
}

function getMemberPositionSummary(member: DutyMember) {
  if (member.positions.length === 0) {
    return "Должность не назначена.";
  }

  const [firstPosition, ...remainingPositions] = member.positions;
  return remainingPositions.length > 0 ? `${firstPosition.title} · + ещё ${remainingPositions.length}` : firstPosition.title;
}

function getMemberMetaLine(member: DutyMember) {
  return [member.rank, member.callsign ? `Позывной: ${member.callsign}` : null, serviceStatusLabels[member.serviceStatus]]
    .filter(Boolean)
    .join(" · ");
}

function createDraft(member?: DutyMember): DutyMemberDraft {
  if (!member) {
    return emptyDraft;
  }

  return {
    accessLogin: member.access?.login ?? "",
    callsign: member.callsign ?? "",
    fullName: member.fullName,
    notes: member.notes ?? "",
    photoUrl: member.photoUrl ?? "",
    rank: member.rank ?? "",
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
    member.access?.roleLabel,
    ...member.positions.flatMap((position) => [position.title, position.sectionName]),
  ]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase("ru-RU").includes(normalizedQuery));
}

function matchesAccessFilter(member: DutyMember, filter: DutyAccessFilter) {
  if (filter === "with_access") {
    return Boolean(member.access?.isActive);
  }

  if (filter === "without_access") {
    return !member.access;
  }

  if (filter === "blocked") {
    return Boolean(member.access && !member.access.isActive);
  }

  return true;
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

export default function DutyMembersPage() {
  const [members, setMembers] = useState<DutyMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessUsers, setAccessUsers] = useState<AccessUserOption[]>([]);
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
    () => members.filter((member) => matchesAccessFilter(member, accessFilter)).filter((member) => matchesMemberSearch(member, searchQuery)),
    [accessFilter, members, searchQuery],
  );
  const canManage = currentUser?.role === "system_admin" || currentUser?.role === "officer";
  const isOwnProfile = Boolean(selectedMember?.access && selectedMember.access.login === currentUser?.login);
  const isEditing = isCreating || Boolean(editingId);
  const availableAccessUsers = useMemo(
    () => accessUsers.filter((user) => !user.dutyMemberId || user.dutyMemberId === editingId),
    [accessUsers, editingId],
  );

  useEffect(() => {
    let isCancelled = false;

    const loadHandle = window.setTimeout(() => {
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
          setMembers(loadedMembers);
          setSelectedMemberId((currentId) => currentId ?? loadedMembers[0]?.id ?? null);
        }

        if (loadedUser?.role === "system_admin" || loadedUser?.role === "officer") {
          const loadedAccessUsers = await apiFetchJson<AccessUserOption[]>("/api/duty-members/access-users").catch(() => []);

          if (!isCancelled) {
            setAccessUsers(loadedAccessUsers);
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
  }, []);

  function updateDraft(field: keyof DutyMemberDraft, value: string) {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
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

    if (!draft.fullName.trim()) {
      setActionMessage("Укажите ФИО.");
      return;
    }

    setIsSaving(true);
    setActionMessage("");

    try {
      const savedMember = await apiFetchJson<DutyMember>(
        editingId ? `/api/duty-members/${editingId}` : "/api/duty-members",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildMemberPayload(draft)),
        },
      );

      setMembers((currentMembers) => {
        if (editingId) {
          return currentMembers.map((member) => (member.id === savedMember.id ? savedMember : member));
        }

        return [savedMember, ...currentMembers];
      });
      setAccessUsers((currentUsers) =>
        currentUsers.map((user) => ({
          ...user,
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
      message: "Профиль будет переведён в состояние исключённого из состава.",
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
              <span className="eyebrow-text">{editingId ? "Изменение профиля" : "Новый профиль"}</span>
              <h1>{editingId ? "Редактирование профиля состава" : "Добавление в состав"}</h1>
            </div>
          </div>
          <div className="modal-body duty-member-modal-body">
            <div className="duty-member-form-grid">
              <label className="filter-field duty-member-form-wide">
                <span>ФИО</span>
                <input disabled={isSaving} maxLength={120} onChange={(event) => updateDraft("fullName", event.target.value)} value={draft.fullName} />
              </label>
              <label className="filter-field">
                <span>Позывной</span>
                <input disabled={isSaving} maxLength={80} onChange={(event) => updateDraft("callsign", event.target.value)} value={draft.callsign} />
              </label>
              <label className="filter-field">
                <span>Звание</span>
                <input disabled={isSaving} maxLength={80} onChange={(event) => updateDraft("rank", event.target.value)} value={draft.rank} />
              </label>
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
                <span>Связанный пользователь доступа</span>
                <select disabled={isSaving} onChange={(event) => updateDraft("accessLogin", event.target.value)} value={draft.accessLogin}>
                  <option value="">Не назначать доступ</option>
                  {availableAccessUsers.map((user) => (
                    <option key={user.login} value={user.login}>
                      {user.displayName || user.login} · {user.roleLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-field duty-member-form-wide">
                <span>Фотография</span>
                <input disabled={isSaving} maxLength={500} onChange={(event) => updateDraft("photoUrl", event.target.value)} placeholder="Например: https://..." type="url" value={draft.photoUrl} />
              </label>
              <div className="profile-photo-preview duty-member-photo-preview">
                <span className="profile-photo-title">Фото профиля</span>
                <div className="profile-photo-frame">
                  {normalizedPhotoUrl ? (
                    <img alt="Фотография профиля состава" src={normalizedPhotoUrl} />
                  ) : (
                    <img alt="Фотография не указана" className="profile-photo-placeholder" src="/no-data-person.png" />
                  )}
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
            {isSaving ? "Сохранение..." : "Сохранить профиль"}
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
                      <input onChange={(event) => setSearchQuery(event.target.value)} placeholder="ФИО, позывной, звание или доступ" type="search" value={searchQuery} />
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
                      Добавить профиль
                    </button>
                  ) : null}
                </div>

                {isLoading ? <p className="empty-state">Загрузка состава...</p> : null}
                {!isLoading && loadError ? <p className="draft-message">{loadError}</p> : null}
                {!isLoading && !loadError && members.length === 0 ? <p className="empty-state">Профили состава пока не добавлены.</p> : null}
                {!isLoading && !loadError && members.length > 0 && filteredMembers.length === 0 ? <p className="empty-state">Профили не найдены.</p> : null}
                {!isLoading && !loadError && filteredMembers.length > 0 ? (
                  <div className="duty-member-list">
                    {filteredMembers.map((member) => (
                      <button
                        className={selectedMemberId === member.id ? "duty-member-list-row duty-member-list-row-active" : "duty-member-list-row"}
                        key={member.id}
                        onClick={() => {
                          setSelectedMemberId(member.id);
                          closeForm();
                        }}
                        type="button"
                      >
                        <span className="duty-member-list-photo">
                          <img
                            alt="Фотография профиля состава"
                            className={!member.photoUrl ? "profile-photo-placeholder" : undefined}
                            src={member.photoUrl || "/no-data-person.png"}
                          />
                        </span>
                        <span className="duty-member-list-copy">
                          <span className="profile-list-item-head">
                            <strong className="profile-list-name">{getMemberPrimaryName(member)}</strong>
                            <span className={`profile-state-badge badge-chip ${selectedMemberId === member.id ? "badge-service-group" : ""}`}>
                              {serviceStatusLabels[member.serviceStatus]}
                            </span>
                          </span>
                          <span className="profile-list-info-row">
                            {getMemberSecondaryName(member) ? <span className="profile-list-meta">Позывной: {getMemberSecondaryName(member)}</span> : null}
                            {member.rank ? <span className="profile-list-meta">{member.rank}</span> : null}
                          </span>
                          <span className="profile-list-meta duty-member-position-preview">{getMemberPositionSummary(member)}</span>
                          <span className="profile-list-badges">
                            <span className={`profile-state-badge badge-chip ${getAccessBadgeClass(member)}`}>{getAccessStatus(member)}</span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="registry-panel registry-panel-detail duty-member-detail-panel">
                {actionMessage ? <p className="draft-message">{actionMessage}</p> : null}

                {!isEditing && selectedMember ? (
                  <article className="duty-member-profile">
                    <div className="profile-detail duty-member-detail-card">
                      <div className="profile-hero duty-member-hero">
                        <div className="profile-hero-photo duty-member-hero-photo">
                          <img
                            alt="Фотография профиля состава"
                            className={!selectedMember.photoUrl ? "profile-photo-placeholder" : undefined}
                            src={selectedMember.photoUrl || "/no-data-person.png"}
                          />
                        </div>

                        <div className="profile-hero-main">
                          <div className="profile-hero-head">
                            <div className="profile-hero-badges">
                              <span className="profile-badge badge-chip">{serviceStatusLabels[selectedMember.serviceStatus]}</span>
                              <span className={`profile-badge badge-chip ${getAccessBadgeClass(selectedMember)}`}>{getAccessStatus(selectedMember)}</span>
                            </div>
                            <div className="profile-hero-identity">
                              <h1 className="profile-hero-title">{getMemberPrimaryName(selectedMember)}</h1>
                              <p className="profile-hero-subtitle">{getMemberMetaLine(selectedMember) || "Служебные сведения не указаны."}</p>
                            </div>
                          </div>

                          <div className="profile-hero-notes">
                            <section className="profile-hero-note">
                              <span>Должность</span>
                              <p>{getMemberPositionSummary(selectedMember)}</p>
                            </section>
                            <section className="profile-hero-note">
                              <span>Заметки</span>
                              <p>{selectedMember.notes || "Заметок нет."}</p>
                            </section>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="profile-detail-block">
                      <div className="block-heading-row">
                        <div>
                          <span>Сведения</span>
                          <h2>Основные данные</h2>
                        </div>
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
                          <dt>Роль доступа</dt>
                          <dd>{selectedMember.access ? getRoleLabel(selectedMember.access.role) : "Не назначена"}</dd>
                        </div>
                      </dl>
                      {selectedMember.notes ? <p className="duty-member-notes">{selectedMember.notes}</p> : null}
                    </div>

                    <div className="profile-detail-block">
                      <div className="block-heading-row">
                        <div>
                          <span>Должности</span>
                          <h2>Назначения в штатном списке</h2>
                        </div>
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
                        <p className="empty-state">Должность не назначена.</p>
                      )}
                    </div>

                    <div className="profile-detail-block">
                      <div className="block-heading-row">
                        <div>
                          <span>Служебный доступ</span>
                          <h2>{getAccessStatus(selectedMember)}</h2>
                        </div>
                      </div>
                      {selectedMember.access ? (
                        <dl className="registry-info-grid">
                          <div className="registry-info-field">
                            <dt>Логин</dt>
                            <dd>{selectedMember.access.login}</dd>
                          </div>
                          <div className="registry-info-field">
                            <dt>Отображаемое имя</dt>
                            <dd>{selectedMember.access.displayName || selectedMember.access.login}</dd>
                          </div>
                          <div className="registry-info-field">
                            <dt>Роль доступа</dt>
                            <dd>{selectedMember.access.roleLabel}</dd>
                          </div>
                          <div className="registry-info-field">
                            <dt>Статус доступа</dt>
                            <dd>{getAccessStatus(selectedMember)}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="empty-state">Доступ не назначен</p>
                      )}
                    </div>

                    {canManage ? (
                      <div className="profile-detail-block">
                        <div className="block-heading-row">
                          <div>
                            <span>Служебные действия</span>
                            <h2>Управление профилем</h2>
                          </div>
                        </div>
                        <div className="toolbar-row duty-member-actions">
                          <button className="command-row interactive-button" onClick={() => startEdit(selectedMember)} type="button">
                            Изменить профиль
                          </button>
                          {selectedMember.access?.isActive ? (
                            <button className="command-row interactive-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestAccessChange(selectedMember, false)} type="button">
                              Временно заблокировать доступ
                            </button>
                          ) : selectedMember.access ? (
                            <button className="command-row interactive-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestAccessChange(selectedMember, true)} type="button">
                              Восстановить доступ
                            </button>
                          ) : (
                            <span className="registry-status-badge-muted">Доступ не назначен</span>
                          )}
                          <button className="primary-command interactive-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestExclude(selectedMember)} type="button">
                            Исключить из состава
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {isOwnProfile ? (
                      <form className="profile-detail-block duty-password-form" onSubmit={handlePasswordSubmit}>
                        <div className="block-heading-row">
                          <div>
                            <span>Служебный доступ</span>
                            <h2>Смена пароля</h2>
                          </div>
                        </div>
                        <div className="duty-member-form-grid">
                          <label className="filter-field">
                            <span>Текущий пароль</span>
                            <input autoComplete="current-password" onChange={(event) => setPasswordDraft((current) => ({ ...current, currentPassword: event.target.value }))} type="password" value={passwordDraft.currentPassword} />
                          </label>
                          <label className="filter-field">
                            <span>Новый пароль</span>
                            <input autoComplete="new-password" onChange={(event) => setPasswordDraft((current) => ({ ...current, newPassword: event.target.value }))} type="password" value={passwordDraft.newPassword} />
                          </label>
                          <label className="filter-field">
                            <span>Повтор нового пароля</span>
                            <input autoComplete="new-password" onChange={(event) => setPasswordDraft((current) => ({ ...current, repeatPassword: event.target.value }))} type="password" value={passwordDraft.repeatPassword} />
                          </label>
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
