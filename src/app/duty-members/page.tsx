"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { Pagination } from "@/components/ui/Pagination";
import { addActivityLogEntry } from "@/lib/activity-log";
import { dutyRanks, dutyStaffPositions } from "@/lib/duty-structure";
import { dutyMembers as initialDutyMembers } from "@/lib/mock-data";
import type { DutyMember, DutyMemberProfileStatus, DutyServiceStatus, DutyStaffPosition } from "@/lib/types";
import {
  clampPage,
  DUTY_MEMBERS_STORAGE_KEY,
  getPaginatedItems,
  readStoredCollection,
  writeStoredCollection,
} from "@/lib/stalker-utils";

const profileStatusFilters = [
  { label: "Активные", value: "active" },
  { label: "Архив", value: "archived" },
  { label: "Все", value: "all" },
] as const;

type ProfileStatusFilter = (typeof profileStatusFilters)[number]["value"];
type DutyMembersMode = "members" | "staff";

type DutyMemberDraft = {
  fullName: string;
  callSign: string;
  birthDate: string;
  appearance: string;
  rank: string;
  position: string;
  staffPositionId: string;
  unit: string;
  serviceStatus: DutyServiceStatus;
  notes: string;
};

const profileStatusLabels: Record<DutyMemberProfileStatus, string> = {
  active: "Активен",
  archived: "Архив",
};

const serviceStatusLabels: Record<DutyServiceStatus, string> = {
  active: "На службе",
  leave: "В отпуске",
  wounded: "Ранен",
  missing: "Пропал",
  discharged: "Списан",
};

const emptyDraft: DutyMemberDraft = {
  fullName: "",
  callSign: "",
  birthDate: "",
  appearance: "",
  rank: "",
  position: "",
  staffPositionId: "",
  unit: "",
  serviceStatus: "active",
  notes: "",
};

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "не указано";
}

function getMemberTitle(member: DutyMember) {
  return member.callSign || member.callsign || member.fullName || "Без имени";
}

function getMemberSecondaryTitle(member: DutyMember) {
  return getMemberTitle(member) !== member.fullName ? member.fullName : "";
}

function getProfileStatusBadgeClass(status: DutyMemberProfileStatus) {
  return status === "active" ? "badge-state-group" : "badge-state-archive";
}

function getServiceStatusBadgeClass(status: DutyServiceStatus) {
  switch (status) {
    case "active":
      return "badge-task-completed";
    case "leave":
      return "badge-state-archive";
    case "wounded":
      return "badge-task-overdue";
    case "missing":
      return "badge-affiliation-bandit";
    case "discharged":
      return "badge-neutral";
    default:
      return "badge-neutral";
  }
}

function mapMemberToDraft(member: DutyMember): DutyMemberDraft {
  return {
    fullName: member.fullName,
    callSign: member.callSign || member.callsign || "",
    birthDate: member.birthDate,
    appearance: member.appearance,
    rank: member.rank,
    position: member.position,
    staffPositionId: member.staffPositionId ?? "",
    unit: member.unit,
    serviceStatus: member.serviceStatus,
    notes: member.notes,
  };
}

export default function DutyMembersPage() {
  const [members, setMembers] = useState<DutyMember[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeMode, setActiveMode] = useState<DutyMembersMode>("members");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [profileStatusFilter, setProfileStatusFilter] = useState<ProfileStatusFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DutyMemberDraft>(emptyDraft);
  const [tableMessage, setTableMessage] = useState("");
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    const storedMembers = readStoredCollection<DutyMember>(DUTY_MEMBERS_STORAGE_KEY, initialDutyMembers);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client hydration from localStorage
    setMembers(storedMembers);
    setSelectedMemberId(storedMembers[0]?.id ?? null);
    setIsLoaded(true);
  }, []);

  function persistMembers(nextMembers: DutyMember[]) {
    setMembers(nextMembers);
    writeStoredCollection(DUTY_MEMBERS_STORAGE_KEY, nextMembers);
  }

  const visibleMembers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return members.filter((member) => {
      if (profileStatusFilter !== "all" && member.profileStatus !== profileStatusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [member.fullName, member.callSign, member.callsign, member.rank, member.position, member.unit]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [members, profileStatusFilter, searchQuery]);

  const safeMemberPage = clampPage(memberPage, visibleMembers.length);
  const paginatedMembers = getPaginatedItems(visibleMembers, safeMemberPage);
  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
  const memberSummary = useMemo(() => {
    const departments = new Set(members.map((member) => member.unit).filter(Boolean));

    return {
      total: members.length,
      active: members.filter((member) => member.profileStatus === "active").length,
      archived: members.filter((member) => member.profileStatus === "archived").length,
      departments: departments.size,
    };
  }, [members]);

  const staffPositionsByDepartment = useMemo(() => {
    const grouped = new Map<string, DutyStaffPosition[]>();

    dutyStaffPositions.forEach((position) => {
      const current = grouped.get(position.department) ?? [];
      current.push(position);
      grouped.set(position.department, current);
    });

    return Array.from(grouped.entries());
  }, []);

  function updateDraft<Field extends keyof DutyMemberDraft>(field: Field, value: DutyMemberDraft[Field]) {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    setFormMessage("");
  }

  function getPositionOccupant(position: DutyStaffPosition) {
    return members.find(
      (member) =>
        member.profileStatus === "active" && (member.staffPositionId === position.id || member.position === position.title),
    );
  }

  const staffSummary = {
    total: dutyStaffPositions.length,
    occupied: dutyStaffPositions.filter((position) => !position.isVacant || Boolean(getPositionOccupant(position))).length,
    vacant: dutyStaffPositions.filter((position) => position.isVacant && !getPositionOccupant(position)).length,
  };

  function getPositionOptionLabel(position: DutyStaffPosition) {
    const occupant = getPositionOccupant(position);
    const baseLabel = `${position.department} — ${position.title}`;

    if (occupant) {
      return `${baseLabel} — ${occupant.rank || "звание не указано"} ${occupant.fullName}`;
    }

    if (!position.isVacant) {
      const defaultRank = position.defaultRank ? `${position.defaultRank} ` : "";
      const defaultFullName = position.defaultFullName ?? "занято по штату";
      return `${baseLabel} — ${defaultRank}${defaultFullName}`.trim();
    }

    return `${baseLabel} — ВАКАНТ`;
  }

  function openCreateForm() {
    setEditingMemberId(null);
    setDraft(emptyDraft);
    setFormMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(member: DutyMember) {
    setEditingMemberId(member.id);
    setDraft(mapMemberToDraft(member));
    setFormMessage("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingMemberId(null);
    setDraft(emptyDraft);
    setFormMessage("");
  }

  function openMember(memberId: string) {
    setSelectedMemberId(memberId);
  }

  function handleMemberCardKeyDown(event: KeyboardEvent<HTMLElement>, memberId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openMember(memberId);
  }

  function handleStaffPositionChange(staffPositionId: string) {
    const nextPosition = dutyStaffPositions.find((position) => position.id === staffPositionId);

    setDraft((currentDraft) => ({
      ...currentDraft,
      staffPositionId,
      position: nextPosition?.title ?? "",
      unit: nextPosition?.department ?? currentDraft.unit,
      rank: currentDraft.rank || nextPosition?.defaultRank || "",
    }));
    setFormMessage("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.fullName.trim()) {
      setFormMessage("Укажите ФИО члена группировки.");
      return;
    }

    if (!draft.position.trim() || !draft.unit.trim()) {
      setFormMessage("Выберите штатную должность.");
      return;
    }

    const timestamp = new Date().toISOString();

    if (editingMemberId) {
      const memberTitle = draft.callSign.trim() || draft.fullName.trim() || "Без имени";
      const nextMembers = members.map((member) =>
        member.id === editingMemberId
          ? {
              ...member,
              fullName: draft.fullName.trim(),
              callSign: draft.callSign.trim(),
              callsign: draft.callSign.trim(),
              birthDate: draft.birthDate,
              appearance: draft.appearance.trim(),
              rank: draft.rank,
              position: draft.position,
              staffPositionId: draft.staffPositionId || undefined,
              unit: draft.unit,
              serviceStatus: draft.serviceStatus,
              notes: draft.notes.trim(),
              updatedAt: timestamp,
            }
          : member,
      );

      persistMembers(nextMembers);
      setTableMessage("Профиль члена «Долга» обновлён.");
      addActivityLogEntry({
        type: "duty_member",
        title: `Изменён профиль члена «Долга»: ${memberTitle}`,
        status: "OK",
      });
      closeForm();
      return;
    }

    const memberTitle = draft.callSign.trim() || draft.fullName.trim() || "Без имени";
    const nextMember: DutyMember = {
      id: crypto.randomUUID(),
      fullName: draft.fullName.trim(),
      callSign: draft.callSign.trim(),
      callsign: draft.callSign.trim(),
      birthDate: draft.birthDate,
      appearance: draft.appearance.trim(),
      rank: draft.rank,
      position: draft.position,
      staffPositionId: draft.staffPositionId || undefined,
      unit: draft.unit,
      serviceStatus: draft.serviceStatus,
      profileStatus: "active",
      notes: draft.notes.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const nextMembers = [nextMember, ...members];
    persistMembers(nextMembers);
    setSelectedMemberId(nextMember.id);
    setTableMessage("Профиль члена «Долга» создан.");
    addActivityLogEntry({
      type: "duty_member",
      title: `Создан профиль члена «Долга»: ${memberTitle}`,
      status: "OK",
    });
    closeForm();
  }

  function toggleArchive(memberId: string, profileStatus: DutyMemberProfileStatus) {
    const member = members.find((currentMember) => currentMember.id === memberId);
    const nextStatus: DutyMemberProfileStatus = profileStatus === "active" ? "archived" : "active";
    const timestamp = new Date().toISOString();
    const nextMembers = members.map((member) =>
      member.id === memberId ? { ...member, profileStatus: nextStatus, updatedAt: timestamp } : member,
    );

    persistMembers(nextMembers);
    setTableMessage(profileStatus === "active" ? "Профиль перенесён в архив." : "Профиль возвращён из архива.");
    addActivityLogEntry({
      type: "duty_member",
      title:
        profileStatus === "active"
          ? `Профиль члена «Долга» перенесён в архив: ${member ? getMemberTitle(member) : "Без имени"}`
          : `Профиль члена «Долга» возвращён из архива: ${member ? getMemberTitle(member) : "Без имени"}`,
      status: profileStatus === "active" ? "WARN" : "OK",
    });
  }

  function deleteMember(memberId: string) {
    const member = members.find((currentMember) => currentMember.id === memberId);

    if (!window.confirm("Удалить профиль члена «Долга»?")) {
      return;
    }

    const nextMembers = members.filter((member) => member.id !== memberId);
    persistMembers(nextMembers);

    if (selectedMemberId === memberId) {
      setSelectedMemberId(nextMembers[0]?.id ?? null);
    }

    setTableMessage("Профиль удалён.");
    addActivityLogEntry({
      type: "duty_member",
      title: `Профиль члена «Долга» удалён: ${member ? getMemberTitle(member) : "Без имени"}`,
      status: "WARN",
    });
  }

  return (
    <>
      <main className="pda-page">
        <section className="pda-screen">
          <PdaTopbar activeLabel="Состав" />

          <div className="pda-content duty-members-content">
            <section className="section-panel duty-members-panel">
              <div className="duty-members-shell">
                <div className="duty-mode-header">
                  <div>
                    <h1>{activeMode === "members" ? "Состав" : "Штатные должности"}</h1>
                    <p>
                      {activeMode === "members"
                        ? "Личные профили членов «Долга», звания, должности и текущий статус службы."
                        : "Справочник должностей, званий и назначений по подразделениям."}
                    </p>
                  </div>
                  <div className="list-tabs segmented-tabs duty-mode-tabs" role="tablist" aria-label="Режим раздела состава">
                    <button
                      aria-selected={activeMode === "members"}
                      className={activeMode === "members" ? "list-tab list-tab-active" : "list-tab"}
                      onClick={() => setActiveMode("members")}
                      role="tab"
                      type="button"
                    >
                      Личный состав
                    </button>
                    <button
                      aria-selected={activeMode === "staff"}
                      className={activeMode === "staff" ? "list-tab list-tab-active" : "list-tab"}
                      onClick={() => setActiveMode("staff")}
                      role="tab"
                      type="button"
                    >
                      Штатные должности
                    </button>
                  </div>
                </div>

                {activeMode === "members" ? (
                  <>
                    <div className="duty-summary-grid">
                      <div className="journal-stat duty-summary-card">
                        <span>Всего профилей</span>
                        <strong>{memberSummary.total}</strong>
                      </div>
                      <div className="journal-stat duty-summary-card">
                        <span>Активных</span>
                        <strong>{memberSummary.active}</strong>
                      </div>
                      <div className="journal-stat duty-summary-card">
                        <span>В архиве</span>
                        <strong>{memberSummary.archived}</strong>
                      </div>
                      <div className="journal-stat duty-summary-card">
                        <span>Подразделений</span>
                        <strong>{memberSummary.departments}</strong>
                      </div>
                    </div>

                    <div className="duty-members-layout">
                      <section className="profile-column duty-list-column">
                        <div className="list-header-block">
                          <div className="column-header list-column-header">
                            <div className="profile-column-heading">
                              <h1>Личный состав</h1>
                              <p>Поиск, фильтры и карточки профилей членов «Долга».</p>
                            </div>
                            <button className="primary-command profile-create-button" onClick={openCreateForm} type="button">
                              Создать профиль
                            </button>
                          </div>

                          <div className="list-tabs segmented-tabs" role="tablist" aria-label="Фильтр состава">
                            {profileStatusFilters.map((filterItem) => {
                              const isActive = profileStatusFilter === filterItem.value;

                              return (
                                <button
                                  key={filterItem.value}
                                  aria-selected={isActive}
                                  className={isActive ? "list-tab list-tab-active" : "list-tab"}
                                  onClick={() => setProfileStatusFilter(filterItem.value)}
                                  role="tab"
                                  type="button"
                                >
                                  {filterItem.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="filter-bar profile-list-filter duty-list-filter">
                          <label className="filter-field">
                            <span>Поиск</span>
                            <input
                              onChange={(event) => setSearchQuery(event.target.value)}
                              placeholder="ФИО, позывной, звание, должность, подразделение"
                              type="search"
                              value={searchQuery}
                            />
                          </label>
                        </div>

                        {tableMessage ? <p className="table-message">{tableMessage}</p> : null}

                        <div className="list-count-row">Найдено записей: {visibleMembers.length}</div>

                        {!isLoaded ? <p className="empty-state">Загрузка локальных данных...</p> : null}

                        {isLoaded && paginatedMembers.items.length ? (
                          <div className="profile-list duty-member-list">
                            {paginatedMembers.items.map((member) => {
                              const isSelected = member.id === selectedMemberId;

                              return (
                                <article
                                  key={member.id}
                                  className={`profile-list-item duty-member-list-item ${isSelected ? "profile-list-item-active" : ""}`}
                                  onClick={() => openMember(member.id)}
                                  onKeyDown={(event) => handleMemberCardKeyDown(event, member.id)}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="profile-list-item-head">
                                    <div className="profile-list-item-main">
                                      <strong>{getMemberTitle(member)}</strong>
                                      <span className="profile-list-item-secondary">{getMemberSecondaryTitle(member) || member.fullName || "ФИО не указано"}</span>
                                    </div>
                                    <div className="profile-list-badges">
                                      <span className={`profile-state-badge badge-chip ${getServiceStatusBadgeClass(member.serviceStatus)}`}>
                                        {serviceStatusLabels[member.serviceStatus]}
                                      </span>
                                      <span className={`profile-state-badge badge-chip ${getProfileStatusBadgeClass(member.profileStatus)}`}>
                                        {profileStatusLabels[member.profileStatus]}
                                      </span>
                                    </div>
                                  </div>

                                  <dl className="duty-member-list-meta">
                                    <div>
                                      <dt>Звание</dt>
                                      <dd>{member.rank || "не указано"}</dd>
                                    </div>
                                    <div>
                                      <dt>Должность</dt>
                                      <dd>{member.position || "не указано"}</dd>
                                    </div>
                                    <div>
                                      <dt>Подразделение</dt>
                                      <dd>{member.unit || "не указано"}</dd>
                                    </div>
                                  </dl>
                                </article>
                              );
                            })}
                          </div>
                        ) : null}

                        {isLoaded && !paginatedMembers.items.length ? (
                          <div className="empty-state compact-empty-state">
                            <p>Записей по текущему фильтру нет.</p>
                            <span>Измените фильтр или создайте новый профиль члена «Долга».</span>
                          </div>
                        ) : null}

                        <Pagination page={paginatedMembers.page} pageCount={paginatedMembers.pageCount} onPageChange={setMemberPage} />
                      </section>

                      <section className="profile-column detail-host-column duty-detail-column">
                        <div className="profile-detail duty-member-detail">
                          {selectedMember ? (
                            <>
                              <section className="profile-case-card duty-member-case-card">
                                <div className="duty-member-avatar" aria-hidden="true">
                                  {(selectedMember.callSign || selectedMember.callsign || selectedMember.fullName || "Д").slice(0, 2)}
                                </div>
                                <div className="profile-case-main">
                                  <div className="object-card-toolbar">
                                    <div className="profile-identity">
                                      <h3>{getMemberTitle(selectedMember)}</h3>
                                      <p>{getMemberSecondaryTitle(selectedMember) || selectedMember.fullName || "ФИО не указано"}</p>
                                      <div className="profile-badges">
                                        <span className={`profile-state-badge badge-chip ${getServiceStatusBadgeClass(selectedMember.serviceStatus)}`}>
                                          {serviceStatusLabels[selectedMember.serviceStatus]}
                                        </span>
                                        <span className={`profile-state-badge badge-chip ${getProfileStatusBadgeClass(selectedMember.profileStatus)}`}>
                                          {profileStatusLabels[selectedMember.profileStatus]}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="detail-actions">
                                      <button className="command-row task-action-button" onClick={() => openEditForm(selectedMember)} type="button">
                                        Редактировать
                                      </button>
                                      <button
                                        className="command-row task-action-button"
                                        onClick={() => toggleArchive(selectedMember.id, selectedMember.profileStatus)}
                                        type="button"
                                      >
                                        {selectedMember.profileStatus === "active" ? "В архив" : "Вернуть из архива"}
                                      </button>
                                      <button className="command-row task-action-button group-remove-button" onClick={() => deleteMember(selectedMember.id)} type="button">
                                        Удалить
                                      </button>
                                    </div>
                                  </div>

                                  <dl className="profile-service-grid duty-service-grid">
                                    <div>
                                      <span>Звание</span>
                                      <p>{selectedMember.rank || "не указано"}</p>
                                    </div>
                                    <div>
                                      <span>Должность</span>
                                      <p>{selectedMember.position || "не указано"}</p>
                                    </div>
                                    <div>
                                      <span>Подразделение</span>
                                      <p>{selectedMember.unit || "не указано"}</p>
                                    </div>
                                  </dl>
                                </div>
                              </section>

                              <section className="profile-detail-block">
                                <div className="block-heading-row">
                                  <h2>Основные данные</h2>
                                </div>
                                <dl className="detail-grid">
                                  <div>
                                    <dt>ФИО</dt>
                                    <dd>{selectedMember.fullName || "не указано"}</dd>
                                  </div>
                                  <div>
                                    <dt>Позывной</dt>
                                    <dd>{selectedMember.callSign || selectedMember.callsign || "не указано"}</dd>
                                  </div>
                                  <div>
                                    <dt>Дата рождения</dt>
                                    <dd>{formatDate(selectedMember.birthDate)}</dd>
                                  </div>
                                </dl>
                              </section>

                              <section className="profile-detail-block">
                                <div className="block-heading-row">
                                  <h2>Служебное положение</h2>
                                </div>
                                <dl className="detail-grid">
                                  <div>
                                    <dt>Звание</dt>
                                    <dd>{selectedMember.rank || "не указано"}</dd>
                                  </div>
                                  <div>
                                    <dt>Должность</dt>
                                    <dd>{selectedMember.position || "не указано"}</dd>
                                  </div>
                                  <div>
                                    <dt>Подразделение</dt>
                                    <dd>{selectedMember.unit || "не указано"}</dd>
                                  </div>
                                  <div>
                                    <dt>Статус службы</dt>
                                    <dd>{serviceStatusLabels[selectedMember.serviceStatus]}</dd>
                                  </div>
                                  <div>
                                    <dt>Статус профиля</dt>
                                    <dd>{profileStatusLabels[selectedMember.profileStatus]}</dd>
                                  </div>
                                </dl>
                              </section>

                              <section className="profile-detail-block">
                                <div className="block-heading-row">
                                  <h2>Служебная информация</h2>
                                </div>
                                <div className="duty-notes-grid">
                                  <div className="profile-notes-wide">
                                    <span className="field-caption">Особенности внешности</span>
                                    <p>{selectedMember.appearance || "Не указаны."}</p>
                                  </div>
                                  <div className="profile-notes-wide">
                                    <span className="field-caption">Заметки</span>
                                    <p>{selectedMember.notes || "Заметок пока нет."}</p>
                                  </div>
                                </div>
                              </section>

                              <section className="profile-detail-block">
                                <div className="block-heading-row">
                                  <h2>Системные даты</h2>
                                </div>
                                <dl className="detail-grid compact-detail-grid">
                                  <div>
                                    <dt>Создан</dt>
                                    <dd>{formatDate(selectedMember.createdAt)}</dd>
                                  </div>
                                  <div>
                                    <dt>Обновлён</dt>
                                    <dd>{formatDate(selectedMember.updatedAt)}</dd>
                                  </div>
                                </dl>
                              </section>
                            </>
                          ) : (
                            <div className="empty-state profile-detail-empty duty-detail-empty">
                              <p>Выберите профиль члена «Долга».</p>
                              <span>Здесь откроются звание, должность, подразделение и статус службы.</span>
                              <div className="duty-empty-tips">
                                <span>Создайте профиль для нового бойца.</span>
                                <span>Используйте поиск по позывному, званию или подразделению.</span>
                                <span>Архивируйте профили, которые больше не используются.</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </>
                ) : (
                  <section className="duty-staff-mode">
                    <div className="duty-summary-grid duty-staff-summary-grid">
                      <div className="journal-stat duty-summary-card">
                        <span>Всего должностей</span>
                        <strong>{staffSummary.total}</strong>
                      </div>
                      <div className="journal-stat duty-summary-card">
                        <span>Назначено</span>
                        <strong>{staffSummary.occupied}</strong>
                      </div>
                      <div className="journal-stat duty-summary-card">
                        <span>Вакантно</span>
                        <strong>{staffSummary.vacant}</strong>
                      </div>
                    </div>

                    <div className="duty-staff-groups duty-staff-mode-groups">
                      {staffPositionsByDepartment.map(([department, positions]) => (
                        <section key={department} className="duty-staff-group">
                          <h3>{department}</h3>
                          <div className="duty-staff-position-list">
                            {positions.map((position) => {
                              const occupant = getPositionOccupant(position);
                              const isOccupied = !position.isVacant || Boolean(occupant);

                              return (
                                <article key={position.id} className="duty-staff-position-card">
                                  <div className="work-block-header">
                                    <div>
                                      <h4>{position.title}</h4>
                                      <p>{position.defaultRank ?? "Штатное звание не указано"}</p>
                                    </div>
                                    <span className={`profile-state-badge badge-chip ${isOccupied ? "badge-state-group" : "badge-neutral"}`}>
                                      {isOccupied ? "Назначен" : "Вакантна"}
                                    </span>
                                  </div>
                                  <dl className="detail-grid compact-detail-grid">
                                    <div>
                                      <dt>Штатное звание</dt>
                                      <dd>{position.defaultRank ?? "не указано"}</dd>
                                    </div>
                                    <div>
                                      <dt>Штатное ФИО</dt>
                                      <dd>{position.defaultFullName ?? "не указано"}</dd>
                                    </div>
                                    <div>
                                      <dt>Текущий профиль</dt>
                                      <dd>{occupant ? `${occupant.rank || "звание не указано"} ${occupant.fullName}` : "не назначен"}</dd>
                                    </div>
                                  </dl>
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>

      {isFormOpen ? (
        <div className="modal-overlay" onClick={closeForm} role="presentation">
          <div className="modal-card duty-member-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="section-header modal-header">
              <div>
                <h1>{editingMemberId ? "Редактирование профиля" : "Создание профиля члена «Долга»"}</h1>
                <p>Личные данные, должность, звание и статус службы.</p>
              </div>
              <button className="command-button" onClick={closeForm} type="button">
                Закрыть
              </button>
            </div>

            <form className="stack-form" onSubmit={handleSubmit}>
              <div className="panel-card stack-layout gap-3 duty-form-section">
                <h2>Основные данные</h2>
                <div className="form-grid">
                  <label className="stacked-field">
                    <span>ФИО</span>
                    <input onChange={(event) => updateDraft("fullName", event.target.value)} placeholder="ФИО полностью" type="text" value={draft.fullName} />
                  </label>
                  <label className="stacked-field">
                    <span>Позывной</span>
                    <input onChange={(event) => updateDraft("callSign", event.target.value)} placeholder="Позывной" type="text" value={draft.callSign} />
                  </label>
                  <label className="stacked-field">
                    <span>Дата рождения</span>
                    <input onChange={(event) => updateDraft("birthDate", event.target.value)} type="date" value={draft.birthDate} />
                  </label>
                </div>
              </div>

              <div className="panel-card stack-layout gap-3 duty-form-section">
                <h2>Служба</h2>
                <div className="form-grid">
                  <label className="stacked-field">
                    <span>Звание</span>
                    <select onChange={(event) => updateDraft("rank", event.target.value)} value={draft.rank}>
                      <option value="">Выберите звание</option>
                      {dutyRanks.map((rank) => (
                        <option key={rank} value={rank}>
                          {rank}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stacked-field field-span-full">
                    <span>Должность</span>
                    <select onChange={(event) => handleStaffPositionChange(event.target.value)} value={draft.staffPositionId}>
                      <option value="">Выберите штатную должность</option>
                      {dutyStaffPositions.map((position) => (
                        <option key={position.id} value={position.id}>
                          {getPositionOptionLabel(position)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="stacked-field">
                    <span>Подразделение</span>
                    <input onChange={(event) => updateDraft("unit", event.target.value)} type="text" value={draft.unit} />
                  </label>
                  <label className="stacked-field">
                    <span>Статус службы</span>
                    <select onChange={(event) => updateDraft("serviceStatus", event.target.value as DutyServiceStatus)} value={draft.serviceStatus}>
                      {Object.entries(serviceStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="panel-card stack-layout gap-3 duty-form-section">
                <h2>Описание</h2>
                <div className="form-grid">
                  <label className="stacked-field field-span-full">
                    <span>Особенности внешности</span>
                    <textarea onChange={(event) => updateDraft("appearance", event.target.value)} placeholder="Особенности внешности" value={draft.appearance} />
                  </label>
                  <label className="stacked-field field-span-full">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Служебные заметки" value={draft.notes} />
                  </label>
                </div>
              </div>

              {formMessage ? <p className="form-hint">{formMessage}</p> : null}

              <div className="command-row">
                <button className="command-button" onClick={closeForm} type="button">
                  Отмена
                </button>
                <button className="command-button command-button-primary" type="submit">
                  {editingMemberId ? "Сохранить изменения" : "Сохранить профиль"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
