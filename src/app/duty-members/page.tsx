"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetchJson } from "@/lib/api-client";
import { getRoleLabel, type UserRole } from "@/lib/auth-roles";

type DutyServiceStatus = "active" | "leave" | "wounded" | "missing" | "discharged";
type DutyMemberProfileStatus = "active" | "archived";

type DutyMemberAccess = {
  login: string;
  displayName: string | null;
  role: UserRole;
  roleLabel: string;
  isActive: boolean;
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
  access: DutyMemberAccess | null;
};

type CurrentUser = {
  login: string;
  displayName: string | null;
  role: UserRole;
};

type DutyMemberDraft = {
  accessLogin: string;
  callsign: string;
  fullName: string;
  notes: string;
  position: string;
  profileStatus: DutyMemberProfileStatus;
  rank: string;
  serviceStatus: DutyServiceStatus;
  unit: string;
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
  position: "",
  profileStatus: "active",
  rank: "",
  serviceStatus: "active",
  unit: "",
};

const serviceStatusLabels: Record<DutyServiceStatus, string> = {
  active: "На службе",
  leave: "В отпуске",
  wounded: "Ранен",
  missing: "Пропал",
  discharged: "Списан",
};

const profileStatusLabels: Record<DutyMemberProfileStatus, string> = {
  active: "Активен",
  archived: "Архив",
};

function getMemberPrimaryName(member: DutyMember) {
  return member.callsign || member.fullName || "Без имени";
}

function getMemberSecondaryName(member: DutyMember) {
  return member.callsign ? member.fullName : "";
}

function getMemberDutyLine(member: DutyMember) {
  return [member.rank, member.position, member.unit].filter(Boolean).join(" · ") || "Служебные данные не указаны";
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

function createDraft(member?: DutyMember): DutyMemberDraft {
  if (!member) {
    return emptyDraft;
  }

  return {
    accessLogin: member.access?.login ?? "",
    callsign: member.callsign ?? "",
    fullName: member.fullName,
    notes: member.notes ?? "",
    position: member.position ?? "",
    profileStatus: member.profileStatus,
    rank: member.rank ?? "",
    serviceStatus: member.serviceStatus,
    unit: member.unit ?? "",
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
    member.position,
    member.rank,
    member.unit,
    member.access?.login,
    member.access?.roleLabel,
  ]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase("ru-RU").includes(normalizedQuery));
}

export default function DutyMembersPage() {
  const [members, setMembers] = useState<DutyMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState<DutyMemberDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
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
    () => members.filter((member) => matchesMemberSearch(member, searchQuery)),
    [members, searchQuery],
  );
  const canManage = currentUser?.role === "system_admin" || currentUser?.role === "officer";
  const isOwnProfile = Boolean(selectedMember?.access && selectedMember.access.login === currentUser?.login);
  const isEditing = isCreating || Boolean(editingId);

  useEffect(() => {
    let isCancelled = false;

    const loadHandle = window.setTimeout(() => {
      async function loadInitialData() {
        setIsLoading(true);
        setMessage("");

        try {
          const [loadedMembers, loadedUser] = await Promise.all([
            apiFetchJson<DutyMember[]>("/api/duty-members"),
            apiFetchJson<CurrentUser>("/api/auth/me"),
          ]);

          if (isCancelled) {
            return;
          }

          setMembers(loadedMembers);
          setCurrentUser(loadedUser);
          setSelectedMemberId((currentId) => currentId ?? loadedMembers[0]?.id ?? null);
        } catch (error) {
          if (!isCancelled) {
            setMessage(error instanceof Error ? error.message : "Не удалось загрузить состав.");
          }
        } finally {
          if (!isCancelled) {
            setIsLoading(false);
          }
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
    setMessage("");
  }

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setDraft(emptyDraft);
    setMessage("");
  }

  function startEdit(member: DutyMember) {
    setIsCreating(false);
    setEditingId(member.id);
    setDraft(createDraft(member));
    setMessage("");
  }

  function closeForm() {
    setIsCreating(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setMessage("");
  }

  async function handleMemberSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      setMessage("Доступ к операции запрещён.");
      return;
    }

    if (!draft.fullName.trim()) {
      setMessage("Укажите ФИО.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const savedMember = await apiFetchJson<DutyMember>(
        editingId ? `/api/duty-members/${editingId}` : "/api/duty-members",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );

      setMembers((currentMembers) => {
        if (editingId) {
          return currentMembers.map((member) => (member.id === savedMember.id ? savedMember : member));
        }

        return [savedMember, ...currentMembers];
      });
      setSelectedMemberId(savedMember.id);
      closeForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль.");
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
    setMessage("");

    try {
      const updatedMember = await apiFetchJson<DutyMember>(`/api/duty-members/${member.id}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });

      setMembers((currentMembers) => currentMembers.map((currentMember) => (currentMember.id === updatedMember.id ? updatedMember : currentMember)));
      setConfirmDialog(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить операцию.");
    } finally {
      setIsSaving(false);
    }
  }

  function requestDelete(member: DutyMember) {
    setConfirmDialog({
      title: "Удалить профиль?",
      message: "Профиль состава будет удалён из системы учёта.",
      confirmLabel: "Удалить",
      variant: "danger",
      onConfirm: async () => {
        await deleteMember(member);
      },
    });
  }

  async function deleteMember(member: DutyMember) {
    setIsSaving(true);
    setMessage("");

    try {
      await apiFetchJson<{ ok: true }>(`/api/duty-members/${member.id}`, {
        method: "DELETE",
      });

      setMembers((currentMembers) => {
        const nextMembers = currentMembers.filter((currentMember) => currentMember.id !== member.id);
        setSelectedMemberId(nextMembers[0]?.id ?? null);
        return nextMembers;
      });
      setConfirmDialog(null);
      closeForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить профиль.");
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

    return (
      <form className="duty-member-editor registry-panel" onSubmit={handleMemberSubmit}>
        <div className="registry-section-header">
          <div>
            <span className="eyebrow-text">{editingId ? "Изменение профиля" : "Новый профиль"}</span>
            <h2>{editingId ? "Редактирование профиля состава" : "Добавление в состав"}</h2>
          </div>
        </div>
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
            <span>Логин доступа</span>
            <input disabled={isSaving} maxLength={64} onChange={(event) => updateDraft("accessLogin", event.target.value)} value={draft.accessLogin} />
          </label>
          <label className="filter-field">
            <span>Звание</span>
            <input disabled={isSaving} maxLength={80} onChange={(event) => updateDraft("rank", event.target.value)} value={draft.rank} />
          </label>
          <label className="filter-field">
            <span>Должность</span>
            <input disabled={isSaving} maxLength={120} onChange={(event) => updateDraft("position", event.target.value)} value={draft.position} />
          </label>
          <label className="filter-field">
            <span>Подразделение</span>
            <input disabled={isSaving} maxLength={120} onChange={(event) => updateDraft("unit", event.target.value)} value={draft.unit} />
          </label>
          <label className="filter-field">
            <span>Статус службы</span>
            <select disabled={isSaving} onChange={(event) => updateDraft("serviceStatus", event.target.value)} value={draft.serviceStatus}>
              {Object.entries(serviceStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Статус профиля</span>
            <select disabled={isSaving} onChange={(event) => updateDraft("profileStatus", event.target.value)} value={draft.profileStatus}>
              {Object.entries(profileStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field duty-member-form-wide">
            <span>Заметки</span>
            <textarea disabled={isSaving} maxLength={1000} onChange={(event) => updateDraft("notes", event.target.value)} value={draft.notes} />
          </label>
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
    );
  }

  return (
    <main className="pda-page duty-members-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Состав" />

        <div className="pda-content duty-members-content">
          <section className="duty-members-shell">
            <header className="duty-mode-header">
              <div>
                <h1>Состав группировки</h1>
                <p>Служебные профили участников состава и контроль доступа к системе учёта.</p>
              </div>
              {canManage ? (
                <button className="primary-command interactive-button" onClick={startCreate} type="button">
                  Добавить профиль
                </button>
              ) : null}
            </header>

            <section className="duty-members-layout">
              <div className="registry-panel registry-panel-list duty-members-list-panel">
                <div className="filter-bar duty-list-filter">
                  <label className="filter-field">
                    <span>Поиск по составу</span>
                    <input onChange={(event) => setSearchQuery(event.target.value)} placeholder="ФИО, позывной, должность или логин" type="search" value={searchQuery} />
                  </label>
                </div>

                {isLoading ? <p className="empty-state">Загрузка состава...</p> : null}
                {!isLoading && members.length === 0 ? <p className="empty-state">Профили состава пока не добавлены.</p> : null}
                {!isLoading && members.length > 0 && filteredMembers.length === 0 ? <p className="empty-state">Профили не найдены.</p> : null}
                {!isLoading && filteredMembers.length > 0 ? (
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
                        <span>{getMemberPrimaryName(member)}</span>
                        {getMemberSecondaryName(member) ? <small>{getMemberSecondaryName(member)}</small> : null}
                        <small>{getMemberDutyLine(member)}</small>
                        <em className={getAccessBadgeClass(member)}>{getAccessStatus(member)}</em>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="registry-panel registry-panel-detail duty-member-detail-panel">
                {message ? <p className="draft-message">{message}</p> : null}
                {renderMemberForm()}

                {!isEditing && selectedMember ? (
                  <article className="duty-member-profile">
                    <div className="profile-detail-block">
                      <div className="block-heading-row">
                        <div>
                          <span>Профиль состава</span>
                          <h2>{getMemberPrimaryName(selectedMember)}</h2>
                        </div>
                        <span className={getAccessBadgeClass(selectedMember)}>{getAccessStatus(selectedMember)}</span>
                      </div>
                      {getMemberSecondaryName(selectedMember) ? <p className="duty-member-subtitle">{getMemberSecondaryName(selectedMember)}</p> : null}
                      <dl className="registry-info-grid">
                        <div className="registry-info-field">
                          <dt>Звание</dt>
                          <dd>{selectedMember.rank || "Не указано"}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Должность</dt>
                          <dd>{selectedMember.position || "Не указана"}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Подразделение</dt>
                          <dd>{selectedMember.unit || "Не указано"}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Статус службы</dt>
                          <dd>{serviceStatusLabels[selectedMember.serviceStatus]}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Статус профиля</dt>
                          <dd>{profileStatusLabels[selectedMember.profileStatus]}</dd>
                        </div>
                        <div className="registry-info-field">
                          <dt>Служебная роль</dt>
                          <dd>{selectedMember.access ? getRoleLabel(selectedMember.access.role) : "Не назначена"}</dd>
                        </div>
                      </dl>
                      {selectedMember.notes ? <p className="duty-member-notes">{selectedMember.notes}</p> : null}
                    </div>

                    <div className="profile-detail-block">
                      <div className="block-heading-row">
                        <div>
                          <span>Служебный доступ</span>
                          <h2>{selectedMember.access ? selectedMember.access.login : "Доступ не назначен"}</h2>
                        </div>
                      </div>
                      {selectedMember.access ? (
                        <dl className="registry-info-grid">
                          <div className="registry-info-field">
                            <dt>Имя доступа</dt>
                            <dd>{selectedMember.access.displayName || selectedMember.access.login}</dd>
                          </div>
                          <div className="registry-info-field">
                            <dt>Роль</dt>
                            <dd>{selectedMember.access.roleLabel}</dd>
                          </div>
                          <div className="registry-info-field">
                            <dt>Состояние</dt>
                            <dd>{getAccessStatus(selectedMember)}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="empty-state">Профиль состава не связан со служебным доступом.</p>
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
                            Редактировать профиль
                          </button>
                          {selectedMember.access?.isActive ? (
                            <button className="command-row interactive-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestAccessChange(selectedMember, false)} type="button">
                              Временно заблокировать доступ
                            </button>
                          ) : selectedMember.access ? (
                            <button className="command-row interactive-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestAccessChange(selectedMember, true)} type="button">
                              Восстановить доступ
                            </button>
                          ) : null}
                          <button className="primary-command interactive-button" disabled={!canManageTarget(selectedMember)} onClick={() => requestDelete(selectedMember)} type="button">
                            Удалить профиль
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

                {!isEditing && !selectedMember && !isLoading ? (
                  <div className="empty-state profile-detail-empty">
                    <p>Выберите профиль состава или добавьте новый.</p>
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        </div>
      </section>

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
