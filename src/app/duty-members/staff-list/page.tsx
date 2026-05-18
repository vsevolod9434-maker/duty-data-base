"use client";

import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiFetchJson } from "@/lib/api-client";
import type { UserRole } from "@/lib/auth-roles";
import { cachePolicy, dutyDataKeys, scheduleClientStateSync, TWO_HOURS, useCurrentUserCacheKey, useDutyQueryClient } from "@/lib/data-cache";
import { compareDutyMembersByRankAndName } from "@/lib/duty-members";

type DutyMember = {
  id: string;
  fullName: string;
  callsign: string | null;
  rank: string | null;
  serviceStatus: string;
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

function getMemberLabel(member: DutyMember) {
  return [member.rank, member.fullName].filter(Boolean).join(" ") || member.callsign || "Без имени";
}

function matchesMemberSearch(member: DutyMember, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");

  if (!normalizedQuery) {
    return true;
  }

  return [member.fullName, member.callsign, member.rank]
    .filter(Boolean)
    .some((value) => value!.toLocaleLowerCase("ru-RU").includes(normalizedQuery));
}

function getSortedMembers(members: DutyMember[]) {
  return members.slice().sort(compareDutyMembersByRankAndName);
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [assigningPosition, setAssigningPosition] = useState<StaffPosition | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);

  const canManage = currentUser?.role === "system_admin" || currentUser?.role === "officer";
  const availableMembers = useMemo(
    () =>
      members
        .filter((member) => member.serviceStatus !== "discharged")
        .filter((member) => matchesMemberSearch(member, memberSearchQuery))
        .sort(compareDutyMembersByRankAndName)
        .slice(0, 12),
    [memberSearchQuery, members],
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
    setAssigningPosition(position);
    setMemberSearchQuery("");
    setMessage("");
  }

  function closeAssignDialog() {
    setAssigningPosition(null);
    setMemberSearchQuery("");
  }

  async function assignPosition(position: StaffPosition, dutyMemberId: string | null) {
    setIsSaving(true);
    setMessage("");

    try {
      const updatedSections = await apiFetchJson<StaffSection[]>(`/api/duty-members/staff-list/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dutyMemberId }),
      });

      setSections(updatedSections);
      closeAssignDialog();
      setConfirmDialog(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить операцию.");
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
        message: "Текущий участник будет снят с этой должности.",
        confirmLabel: "Заменить",
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
      title: "Освободить должность?",
      message: "Должность будет отмечена как вакантная.",
      confirmLabel: "Освободить",
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
        <PdaTopbar activeLabel="Состав" activeSubtabLabel="Штатный список" />

        <div className="pda-content duty-members-content">
          <section className="duty-members-shell">
            <section className="registry-panel duty-staff-intro">
              <h2>Штатно-должностной список отряда специального назначения военизированной группировки «Долг»</h2>
              {message ? <p className="draft-message">{message}</p> : null}
            </section>

            {isLoading ? <p className="empty-state">Загрузка штатного списка...</p> : null}
            {!isLoading && sections.length === 0 ? <p className="empty-state">Штатный список пока не заполнен.</p> : null}
            {!isLoading && sections.length > 0 ? (
              <div className="duty-staff-sections">
                {sections.map((section) => (
                  <section className="registry-panel duty-staff-section" key={section.id}>
                    <div className="registry-section-header">
                      <div>
                        <span className="eyebrow-text">Подразделение</span>
                        <h2>{section.name}</h2>
                      </div>
                    </div>

                    <div className="duty-staff-table" role="table" aria-label={section.name}>
                      <div className="duty-staff-table-head" role="row">
                        <span role="columnheader">Должность</span>
                        <span role="columnheader">Назначен</span>
                        {canManage ? <span role="columnheader">Действия</span> : null}
                      </div>
                      {section.positions.map((position) => (
                        <article className="duty-staff-table-row" key={position.id} role="row">
                          <div className="duty-staff-cell duty-staff-cell-position" data-label="Должность" role="cell">
                            <strong>{position.title}</strong>
                          </div>
                          <div className="duty-staff-cell duty-staff-cell-assignee" data-label="Назначен" role="cell">
                            {position.member ? (
                              <>
                                <strong>{getMemberLabel(position.member)}</strong>
                                {position.member.callsign ? <span>Позывной: {position.member.callsign}</span> : null}
                              </>
                            ) : (
                              <span className="duty-vacancy-label">Вакант</span>
                            )}
                          </div>
                          {canManage ? (
                            <div className="duty-staff-cell duty-staff-cell-actions" data-label="Действия" role="cell">
                              <button className="duty-staff-action-button" disabled={isSaving} onClick={() => openAssignDialog(position)} type="button">
                                {position.member ? "Заменить" : "Назначить"}
                              </button>
                              <button className="duty-staff-action-button duty-staff-action-muted" disabled={isSaving || !position.member} onClick={() => requestRelease(position)} type="button">
                                Освободить
                              </button>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}

            <p className="duty-staff-footnote">Список будет дополняться по мере нагруженности подразделения.</p>
          </section>
        </div>
      </section>

      {assigningPosition ? (
        <div className="pda-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeAssignDialog()}>
          <form className="pda-modal duty-staff-assign-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleAssignSubmit}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{assigningPosition.member ? "Заменить назначение" : "Назначить на должность"}</h1>
                <p>{assigningPosition.title}</p>
              </div>
            </div>
            <div className="modal-body">
              <label className="filter-field">
                <span>Поиск участника состава</span>
                <input autoFocus onChange={(event) => setMemberSearchQuery(event.target.value)} placeholder="ФИО, позывной или звание" type="search" value={memberSearchQuery} />
              </label>
              <div className="duty-staff-member-picker">
                {availableMembers.length > 0 ? (
                  availableMembers.map((member) => (
                    <button className="duty-member-list-row" disabled={isSaving} key={member.id} onClick={() => selectMemberForPosition(member)} type="button">
                      <span>{getMemberLabel(member)}</span>
                      {member.callsign ? <small>Позывной: {member.callsign}</small> : null}
                    </button>
                  ))
                ) : (
                  <p className="empty-state">Профили не найдены.</p>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="command-row interactive-button" disabled={isSaving} onClick={closeAssignDialog} type="button">
                Отмена
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
