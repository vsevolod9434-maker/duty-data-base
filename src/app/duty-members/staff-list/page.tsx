"use client";

import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetchJson } from "@/lib/api-client";
import type { UserRole } from "@/lib/auth-roles";
import { cachePolicy, dutyDataKeys, scheduleClientStateSync, TWO_HOURS, useCurrentUserCacheKey, useDutyQueryClient } from "@/lib/data-cache";
import { compareDutyMembersByRankAndName } from "@/lib/duty-members";
import { backendOnlyOperationMessage, isStaticExportEnabled } from "@/lib/static-hosting";

type DutyMemberAccess = {
  displayName?: string | null;
  login: string;
};

type DutyMember = {
  id: string;
  fullName: string;
  callsign: string | null;
  rank: string | null;
  serviceStatus: string;
  access?: DutyMemberAccess | null;
};

type StaffPosition = {
  id: string;
  title: string;
  sortOrder: number;
  member: DutyMember | null;
};

type StaffSection = {
  id: string;
  name: string;
  sortOrder: number;
  positions: StaffPosition[];
};

type CurrentUser = {
  login: string;
  displayName: string | null;
  role: UserRole;
};

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  variant: "danger" | "default" | "warning";
  onConfirm: () => Promise<void>;
};

type DutyStaffFilter = "all" | "occupied" | "vacant";

const staffFilters: Array<{ label: string; value: DutyStaffFilter }> = [
  { label: "Все должности", value: "all" },
  { label: "Занятые", value: "occupied" },
  { label: "Вакантные", value: "vacant" },
];

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

function getMemberPrimaryName(member: DutyMember) {
  return member.callsign?.trim() || member.fullName?.trim() || "Без имени";
}

function getMemberServiceLine(member: DutyMember) {
  return [member.rank, member.fullName].filter(Boolean).join(" · ") || "Служебная карточка без дополнительных сведений";
}

function matchesMemberSearch(member: DutyMember, query: string) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return false;
  }

  return [member.callsign, member.fullName, member.rank, member.id, member.access?.login, member.access?.displayName]
    .filter(Boolean)
    .some((value) => normalizeSearchValue(value!).includes(normalizedQuery));
}

function matchesPositionSearch(position: StaffPosition, sectionName: string, query: string) {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  return [position.title, sectionName, position.id].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

function getSortedMembers(members: DutyMember[]) {
  return members.slice().sort(compareDutyMembersByRankAndName);
}

function getStaffTotals(sections: StaffSection[]) {
  const positions = sections.flatMap((section) => section.positions);
  const occupied = positions.filter((position) => Boolean(position.member)).length;

  return {
    occupied,
    total: positions.length,
    vacant: positions.length - occupied,
  };
}

function getFilteredSections(sections: StaffSection[], filter: DutyStaffFilter) {
  if (filter === "all") {
    return sections;
  }

  return sections
    .map((section) => ({
      ...section,
      positions: section.positions.filter((position) => (filter === "occupied" ? Boolean(position.member) : !position.member)),
    }))
    .filter((section) => section.positions.length > 0);
}

function getPositionSequence(sections: StaffSection[], targetId: string) {
  let sequence = 0;

  for (const section of sections) {
    for (const position of section.positions) {
      sequence += 1;

      if (position.id === targetId) {
        return sequence;
      }
    }
  }

  return 0;
}

function getStaffUnitCountLabel(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} штатных единиц`;
  }

  if (lastDigit === 1) {
    return `${count} штатную единицу`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} штатные единицы`;
  }

  return `${count} штатных единиц`;
}

export default function DutyStaffListPage() {
  const queryClient = useDutyQueryClient();
  const { currentUser: cachedCurrentUser, currentUserKey, isCurrentUserLoading } = useCurrentUserCacheKey();
  const [sections, setSections] = useState<StaffSection[]>(() =>
    currentUserKey ? (queryClient.getQueryData<StaffSection[]>(dutyDataKeys.staffList(currentUserKey)) ?? []) : [],
  );
  const [members, setMembers] = useState<DutyMember[]>(() =>
    currentUserKey ? getSortedMembers(queryClient.getQueryData<DutyMember[]>(dutyDataKeys.dutyMembers(currentUserKey)) ?? []) : [],
  );
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [staffFilter, setStaffFilter] = useState<DutyStaffFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [assigningPosition, setAssigningPosition] = useState<StaffPosition | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkMemberSearchQuery, setBulkMemberSearchQuery] = useState("");
  const [bulkSelectedMember, setBulkSelectedMember] = useState<DutyMember | null>(null);
  const [bulkPositionSearchQuery, setBulkPositionSearchQuery] = useState("");
  const [bulkSelectedPositionIds, setBulkSelectedPositionIds] = useState<string[]>([]);
  const [bulkAssignMessage, setBulkAssignMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);

  const canManage = currentUser?.role === "system_admin" || currentUser?.role === "officer";
  const canUseBackendAdmin = Boolean(canManage && !isStaticExportEnabled);
  const staffTotals = useMemo(() => getStaffTotals(sections), [sections]);
  const filteredSections = useMemo(() => getFilteredSections(sections, staffFilter), [sections, staffFilter]);
  const availableMembers = useMemo(
    () =>
      members
        .filter((member) => member.serviceStatus !== "discharged")
        .filter((member) => matchesMemberSearch(member, memberSearchQuery))
        .sort(compareDutyMembersByRankAndName)
        .slice(0, 12),
    [memberSearchQuery, members],
  );
  const availableBulkMembers = useMemo(
    () =>
      members
        .filter((member) => member.serviceStatus !== "discharged")
        .filter((member) => matchesMemberSearch(member, bulkMemberSearchQuery))
        .sort(compareDutyMembersByRankAndName)
        .slice(0, 12),
    [bulkMemberSearchQuery, members],
  );
  const bulkPositionSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          positions: section.positions.filter((position) => matchesPositionSearch(position, section.name, bulkPositionSearchQuery)),
        }))
        .filter((section) => section.positions.length > 0),
    [bulkPositionSearchQuery, sections],
  );

  const sectionsQuery = useQuery({
    queryKey: dutyDataKeys.staffList(currentUserKey ?? "pending"),
    queryFn: () =>
      apiFetchJson<StaffSection[]>("/api/duty-members/staff-list", undefined, "Не удалось загрузить штатный список. Повторите попытку позже."),
    enabled: Boolean(currentUserKey),
    gcTime: TWO_HOURS,
    staleTime: cachePolicy.staffList,
  });
  const membersQuery = useQuery({
    queryKey: dutyDataKeys.dutyMembers(currentUserKey ?? "pending"),
    queryFn: () => apiFetchJson<DutyMember[]>("/api/duty-members"),
    enabled: Boolean(currentUserKey),
    gcTime: TWO_HOURS,
    staleTime: cachePolicy.dutyMembers,
  });

  useEffect(() => {
    let isCancelled = false;

    const loadHandle = window.setTimeout(() => {
      const cachedSections = currentUserKey ? queryClient.getQueryData<StaffSection[]>(dutyDataKeys.staffList(currentUserKey)) : null;
      const cachedMembers = currentUserKey ? queryClient.getQueryData<DutyMember[]>(dutyDataKeys.dutyMembers(currentUserKey)) : null;

      if (cachedCurrentUser) {
        setCurrentUser(cachedCurrentUser as CurrentUser);
      }

      if (cachedSections) {
        setSections(cachedSections);
        setMembers(getSortedMembers(cachedMembers ?? []));
        setIsLoading(false);
        return;
      }

      async function loadData() {
        setIsLoading(true);
        setMessage("");

        const [loadedUser, loadedSections, loadedMembers] = await Promise.all([
          apiFetchJson<CurrentUser>("/api/auth/me").catch(() => null),
          apiFetchJson<StaffSection[]>("/api/duty-members/staff-list", undefined, "Не удалось загрузить штатный список. Повторите попытку позже.").catch((error) => {
            if (!isCancelled) {
              setMessage(error instanceof Error ? error.message : "Не удалось загрузить штатный список. Повторите попытку позже.");
            }

            return null;
          }),
          apiFetchJson<DutyMember[]>("/api/duty-members").catch(() => []),
        ]);

        if (!isCancelled) {
          if (loadedUser) {
            setCurrentUser(loadedUser);
          }

          if (loadedSections) {
            setSections(loadedSections);
          }

          setMembers(getSortedMembers(loadedMembers));
          setIsLoading(false);
        }
      }

      void loadData();
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
      if (sectionsQuery.data) {
        setSections(sectionsQuery.data);
      }
    });
  }, [sectionsQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (membersQuery.data) {
        setMembers(getSortedMembers(membersQuery.data));
      }
    });
  }, [membersQuery.data]);

  useEffect(() => {
    return scheduleClientStateSync(() => {
      if (sectionsQuery.isError) {
        setMessage("Не удалось загрузить штатный список. Повторите попытку позже.");
      }
      setIsLoading(isCurrentUserLoading || (sectionsQuery.isPending && sections.length === 0));
    });
  }, [isCurrentUserLoading, sections.length, sectionsQuery.isError, sectionsQuery.isPending]);

  useEffect(() => {
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.staffList(currentUserKey), sections);
    }
  }, [currentUserKey, queryClient, sections]);

  useEffect(() => {
    if (currentUserKey) {
      queryClient.setQueryData(dutyDataKeys.dutyMembers(currentUserKey), members);
    }
  }, [currentUserKey, members, queryClient]);

  function openAssignDialog(position: StaffPosition) {
    if (isStaticExportEnabled) {
      setMessage(backendOnlyOperationMessage);
      return;
    }

    setAssigningPosition(position);
    setMemberSearchQuery("");
    setMessage("");
  }

  function closeAssignDialog() {
    setAssigningPosition(null);
    setMemberSearchQuery("");
  }

  function getAssignedPositionsForMember(memberId: string) {
    return sections.flatMap((section) => section.positions).filter((position) => position.member?.id === memberId);
  }

  function openBulkAssignDialog() {
    if (isStaticExportEnabled) {
      setMessage(backendOnlyOperationMessage);
      return;
    }

    setIsBulkAssignOpen(true);
    setBulkMemberSearchQuery("");
    setBulkSelectedMember(null);
    setBulkPositionSearchQuery("");
    setBulkSelectedPositionIds([]);
    setBulkAssignMessage("");
    setMessage("");
  }

  function closeBulkAssignDialog() {
    setIsBulkAssignOpen(false);
    setBulkMemberSearchQuery("");
    setBulkSelectedMember(null);
    setBulkPositionSearchQuery("");
    setBulkSelectedPositionIds([]);
    setBulkAssignMessage("");
  }

  function selectBulkMember(member: DutyMember) {
    setBulkSelectedMember(member);
    setBulkMemberSearchQuery(getMemberPrimaryName(member));
    setBulkAssignMessage("");
  }

  function toggleBulkPosition(position: StaffPosition) {
    if (position.member) {
      setBulkAssignMessage("Занятая штатная единица меняется через карточку должности.");
      return;
    }

    setBulkAssignMessage("");
    setBulkSelectedPositionIds((currentIds) =>
      currentIds.includes(position.id) ? currentIds.filter((positionId) => positionId !== position.id) : [...currentIds, position.id],
    );
  }

  async function assignBulkPositions() {
    if (isStaticExportEnabled) {
      setBulkAssignMessage(backendOnlyOperationMessage);
      return;
    }

    if (!bulkSelectedMember) {
      setBulkAssignMessage("Выберите профиль состава.");
      return;
    }

    if (bulkSelectedPositionIds.length === 0) {
      setBulkAssignMessage("Выберите одну или несколько штатных единиц.");
      return;
    }

    setIsSaving(true);
    setBulkAssignMessage("");
    setMessage("");

    try {
      const updatedSections = await apiFetchJson<StaffSection[]>("/api/duty-members/staff-list/positions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dutyMemberId: bulkSelectedMember.id, positionIds: bulkSelectedPositionIds }),
      });

      setSections(updatedSections);
      if (currentUserKey) {
        queryClient.setQueryData(dutyDataKeys.staffList(currentUserKey), updatedSections);
        void queryClient.invalidateQueries({ queryKey: dutyDataKeys.dutyMembers(currentUserKey) });
      }
      closeBulkAssignDialog();
      setMessage(`Профиль назначен на ${getStaffUnitCountLabel(bulkSelectedPositionIds.length)}`);
    } catch (error) {
      setBulkAssignMessage(error instanceof Error ? error.message : "Не удалось выполнить массовое назначение.");
    } finally {
      setIsSaving(false);
    }
  }

  async function assignPosition(position: StaffPosition, dutyMemberId: string | null) {
    if (isStaticExportEnabled) {
      setMessage(backendOnlyOperationMessage);
      setConfirmDialog(null);
      closeAssignDialog();
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const updatedSections = await apiFetchJson<StaffSection[]>(`/api/duty-members/staff-list/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dutyMemberId }),
      });

      setSections(updatedSections);
      if (currentUserKey) {
        queryClient.setQueryData(dutyDataKeys.staffList(currentUserKey), updatedSections);
        void queryClient.invalidateQueries({ queryKey: dutyDataKeys.dutyMembers(currentUserKey) });
      }
      closeAssignDialog();
      setConfirmDialog(null);
      setMessage(dutyMemberId ? "Профиль назначен" : "Назначение снято");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить штатную единицу");
    } finally {
      setIsSaving(false);
    }
  }

  function selectMemberForPosition(member: DutyMember) {
    if (!assigningPosition) {
      return;
    }

    if (assigningPosition.member && assigningPosition.member.id !== member.id) {
      setConfirmDialog({
        title: "Заменить назначение?",
        message: "Текущий профиль будет снят с этой должности.",
        confirmLabel: "Назначить",
        variant: "warning",
        onConfirm: async () => {
          await assignPosition(assigningPosition, member.id);
        },
      });
      return;
    }

    void assignPosition(assigningPosition, member.id);
  }

  function requestRelease(position: StaffPosition) {
    setConfirmDialog({
      title: "Снять назначение?",
      message: "Штатная единица будет отмечена как вакантная.",
      confirmLabel: "Снять",
      variant: "warning",
      onConfirm: async () => {
        await assignPosition(position, null);
      },
    });
  }

  function handleAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main className="pda-page duty-members-page duty-staff-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Состав" activeSubtabLabel="Штатно-должностной список" />

        <div className="pda-content duty-members-content">
          <section className="duty-members-shell">
            <section className="registry-panel duty-staff-intro">
              <div className="duty-staff-intro-copy">
                <span className="eyebrow-text">Служебный состав</span>
                <h1>Штатно-должностной список</h1>
                <p>Отряд специального назначения военизированной группировки «Долг»</p>
              </div>
              <div className="duty-staff-summary">
                <div>
                  <span>Всего</span>
                  <strong>{staffTotals.total}</strong>
                </div>
                <div>
                  <span>Занято</span>
                  <strong>{staffTotals.occupied}</strong>
                </div>
                <div>
                  <span>Вакантно</span>
                  <strong>{staffTotals.vacant}</strong>
                </div>
              </div>
            </section>

            <div className="registry-panel duty-staff-toolbar">
              <div className="duty-staff-filter-group" role="group" aria-label="Фильтр должностей">
                {staffFilters.map((filter) => (
                  <button
                    aria-pressed={staffFilter === filter.value}
                    className={staffFilter === filter.value ? "duty-staff-filter-button duty-staff-filter-button-active" : "duty-staff-filter-button"}
                    key={filter.value}
                    onClick={() => setStaffFilter(filter.value)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              {canManage ? (
                <button className="duty-staff-action-button duty-staff-bulk-open-button" disabled={isSaving || !canUseBackendAdmin} onClick={openBulkAssignDialog} type="button">
                  Массовое назначение
                </button>
              ) : null}
              {canManage && isStaticExportEnabled ? <p className="draft-message duty-staff-page-message">{backendOnlyOperationMessage}</p> : null}
              {message ? <p className="draft-message duty-staff-page-message">{message}</p> : null}
            </div>

            {isLoading ? <p className="empty-state">Загрузка штатного списка...</p> : null}
            {!isLoading && sections.length === 0 ? <p className="empty-state">Штатный список пока не заполнен.</p> : null}
            {!isLoading && sections.length > 0 && filteredSections.length === 0 ? <p className="empty-state">По выбранному фильтру должности не найдены.</p> : null}
            {!isLoading && filteredSections.length > 0 ? (
              <div className="duty-staff-sections">
                {filteredSections.map((section) => {
                  const sourceSection = sections.find((currentSection) => currentSection.id === section.id) ?? section;
                  const sectionOccupied = sourceSection.positions.filter((position) => position.member).length;

                  return (
                    <section className="registry-panel duty-staff-section" key={section.id}>
                      <div className="registry-section-header duty-staff-section-header">
                        <div>
                          <span className="eyebrow-text">Подразделение</span>
                          <h2>{section.name}</h2>
                        </div>
                        <span className="duty-staff-section-count">
                          {sectionOccupied}/{sourceSection.positions.length}
                        </span>
                      </div>

                      <div className="duty-staff-position-grid">
                        {section.positions.map((position) => {
                          const sequence = getPositionSequence(sections, position.id);

                          return (
                            <article className={position.member ? "duty-staff-card duty-staff-card-occupied" : "duty-staff-card duty-staff-card-vacant"} key={position.id}>
                              <div className="duty-staff-card-main">
                                <div className="duty-staff-card-title-row">
                                  <span className="duty-staff-number">№ {sequence}</span>
                                  <span className={position.member ? "duty-staff-status duty-staff-status-occupied" : "duty-staff-status duty-staff-status-vacant"}>
                                    {position.member ? "Занято" : "Вакантно"}
                                  </span>
                                </div>
                                <h3>{position.title}</h3>
                                <p>{section.name}</p>
                              </div>

                              <div className="duty-staff-card-assignee">
                                <span>{position.member ? "Назначенный профиль" : "Назначение"}</span>
                                {position.member ? (
                                  <>
                                    <strong>{getMemberPrimaryName(position.member)}</strong>
                                    <small>{getMemberServiceLine(position.member)}</small>
                                  </>
                                ) : (
                                  <>
                                    <strong>Вакантно</strong>
                                    <small>Штатная единица свободна для назначения</small>
                                  </>
                                )}
                              </div>

                              {canManage ? (
                                <div className="duty-staff-card-actions">
                                  <button className="duty-staff-action-button" disabled={isSaving || !canUseBackendAdmin} onClick={() => openAssignDialog(position)} type="button">
                                    {position.member ? "Сменить" : "Назначить"}
                                  </button>
                                  <button className="duty-staff-action-button duty-staff-action-muted" disabled={isSaving || !canUseBackendAdmin || !position.member} onClick={() => requestRelease(position)} type="button">
                                    Снять
                                  </button>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>
      </section>

      {assigningPosition ? (
        <div className="pda-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeAssignDialog()}>
          <form className="pda-modal duty-staff-assign-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleAssignSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Назначить</h1>
                <p>{assigningPosition.title}</p>
              </div>
            </div>
            <div className="modal-body duty-staff-assign-body">
              <label className="filter-field">
                <span>Поиск профиля</span>
                <input
                  autoFocus
                  disabled={isSaving}
                  onChange={(event) => setMemberSearchQuery(event.target.value)}
                  placeholder="Введите позывной, ФИО или номер"
                  type="search"
                  value={memberSearchQuery}
                />
              </label>
              <div className="duty-staff-member-picker">
                {!memberSearchQuery.trim() ? <p className="empty-state">Введите позывной, ФИО или номер</p> : null}
                {memberSearchQuery.trim() && availableMembers.length > 0
                  ? availableMembers.map((member) => {
                      const assignmentCount = getAssignedPositionsForMember(member.id).length;
                      const isCurrentAssignee = assigningPosition.member?.id === member.id;

                      return (
                        <button
                          className="duty-staff-member-row"
                          disabled={isSaving}
                          key={member.id}
                          onClick={() => selectMemberForPosition(member)}
                          type="button"
                        >
                          <span>
                            <strong>{getMemberPrimaryName(member)}</strong>
                            <small>{getMemberServiceLine(member)}</small>
                          </span>
                          {isCurrentAssignee ? <em>Назначен на эту должность</em> : null}
                          {!isCurrentAssignee && assignmentCount > 0 ? <em>Назначений: {assignmentCount}</em> : null}
                        </button>
                      );
                    })
                  : null}
                {memberSearchQuery.trim() && availableMembers.length === 0 ? <p className="empty-state">Профили не найдены</p> : null}
              </div>
              {message ? <p className="draft-message">{message}</p> : null}
            </div>
            <div className="modal-actions">
              <button className="command-row interactive-button" disabled={isSaving} onClick={closeAssignDialog} type="button">
                Отмена
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isBulkAssignOpen ? (
        <div className="pda-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeBulkAssignDialog()}>
          <div className="pda-modal duty-staff-bulk-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Массовое назначение</h1>
                <p>Назначение одного профиля на несколько вакантных штатных единиц</p>
              </div>
            </div>
            <div className="modal-body duty-staff-bulk-body">
              <section className="duty-staff-bulk-step">
                <div className="duty-staff-bulk-step-header">
                  <span>1</span>
                  <strong>Профиль состава</strong>
                </div>
                <label className="filter-field">
                  <span>Поиск профиля</span>
                  <input
                    autoFocus
                    disabled={isSaving}
                    onChange={(event) => {
                      setBulkMemberSearchQuery(event.target.value);
                      setBulkSelectedMember(null);
                    }}
                    placeholder="Введите позывной, ФИО или номер"
                    type="search"
                    value={bulkMemberSearchQuery}
                  />
                </label>
                {bulkSelectedMember ? (
                  <div className="duty-staff-selected-member">
                    <span>Выбран профиль</span>
                    <strong>{getMemberPrimaryName(bulkSelectedMember)}</strong>
                    <small>{getMemberServiceLine(bulkSelectedMember)}</small>
                  </div>
                ) : null}
                <div className="duty-staff-member-picker">
                  {!bulkMemberSearchQuery.trim() ? <p className="empty-state">Введите позывной, ФИО или номер</p> : null}
                  {bulkMemberSearchQuery.trim() && !bulkSelectedMember && availableBulkMembers.length > 0
                    ? availableBulkMembers.map((member) => {
                        const assignmentCount = getAssignedPositionsForMember(member.id).length;

                        return (
                          <button className="duty-staff-member-row" disabled={isSaving} key={member.id} onClick={() => selectBulkMember(member)} type="button">
                            <span>
                              <strong>{getMemberPrimaryName(member)}</strong>
                              <small>{getMemberServiceLine(member)}</small>
                            </span>
                            {assignmentCount > 0 ? <em>Назначений: {assignmentCount}</em> : null}
                          </button>
                        );
                      })
                    : null}
                  {bulkMemberSearchQuery.trim() && !bulkSelectedMember && availableBulkMembers.length === 0 ? <p className="empty-state">Профили не найдены</p> : null}
                </div>
              </section>

              <section className="duty-staff-bulk-step">
                <div className="duty-staff-bulk-step-header">
                  <span>2</span>
                  <strong>Штатные единицы</strong>
                </div>
                <label className="filter-field">
                  <span>Поиск должности</span>
                  <input
                    disabled={isSaving || !bulkSelectedMember}
                    onChange={(event) => setBulkPositionSearchQuery(event.target.value)}
                    placeholder="Название должности или подразделение"
                    type="search"
                    value={bulkPositionSearchQuery}
                  />
                </label>
                {!bulkSelectedMember ? <p className="empty-state">Сначала выберите профиль состава</p> : null}
                {bulkSelectedMember ? (
                  <div className="duty-staff-bulk-positions">
                    {bulkPositionSections.length === 0 ? <p className="empty-state">Штатные единицы не найдены</p> : null}
                    {bulkPositionSections.map((section) => (
                      <section className="duty-position-picker-section" key={section.id}>
                        <h2>{section.name}</h2>
                        <div className="duty-staff-position-choice-list">
                          {section.positions.map((position) => {
                            const isSelected = bulkSelectedPositionIds.includes(position.id);
                            const sequence = getPositionSequence(sections, position.id);

                            return (
                              <label className={position.member ? "duty-staff-position-choice duty-staff-position-choice-occupied" : "duty-staff-position-choice"} key={position.id}>
                                <input checked={isSelected} disabled={isSaving || Boolean(position.member)} onChange={() => toggleBulkPosition(position)} type="checkbox" />
                                <span>
                                  <strong>№ {sequence} · {position.title}</strong>
                                  <small>{section.name}</small>
                                </span>
                                <em>{position.member ? `Занято: ${getMemberPrimaryName(position.member)}` : "Вакантно"}</em>
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}
              </section>

              {bulkAssignMessage ? <p className="draft-message">{bulkAssignMessage}</p> : null}
            </div>
            <div className="modal-actions duty-staff-bulk-actions">
              <button className="command-row interactive-button" disabled={isSaving} onClick={closeBulkAssignDialog} type="button">
                Отмена
              </button>
              <button className="command-row interactive-button primary-command" disabled={isSaving || !bulkSelectedMember || bulkSelectedPositionIds.length === 0} onClick={assignBulkPositions} type="button">
                Назначить на {getStaffUnitCountLabel(bulkSelectedPositionIds.length)}
              </button>
            </div>
          </div>
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
