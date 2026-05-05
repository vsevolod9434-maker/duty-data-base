"use client";

/* eslint-disable @next/next/no-img-element */
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { addActivityLogEntry } from "@/lib/activity-log";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import {
  apartmentPaymentStatusLabels,
  apartmentStatusLabels,
  getApartmentOccupancyStatus,
  getApartmentPaymentBadgeClass,
  getApartmentPaymentStatus,
  getLatestApartmentPayment,
  normalizeApartments,
} from "@/lib/apartment-utils";
import {
  forceSystemYear,
  getAffiliationBadgeClass,
  getAffiliationLabel,
  getPaginatedItems,
  getProfileSecondaryTitle,
  getProfileTitle,
  getSystemTimestamp,
  getTodayDate,
  readStoredCollection,
  APARTMENTS_STORAGE_KEY,
  SYSTEM_DATE_MAX,
  SYSTEM_DATE_MIN,
  STALKER_GROUPS_STORAGE_KEY,
  STALKER_PROFILES_STORAGE_KEY,
  writeStoredCollection,
} from "@/lib/stalker-utils";
import type { Apartment, ApartmentPayment, StalkerGroup, StalkerProfile } from "@/lib/types";

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "не указано";
}

function formatMoney(value: number) {
  return value.toLocaleString("ru-RU");
}

function createEmptyPaymentDraft() {
  return {
    paidAt: getTodayDate(),
    amount: "",
    paymentType: "money" as ApartmentPayment["paymentType"],
    paymentMethod: "",
    paidUntil: "",
    notes: "",
  };
}

function getProfileInitials(profile: StalkerProfile) {
  const source = profile.callsign || profile.fullName || "Ж";
  return source.slice(0, 2);
}

function getPaymentDisplay(payment: ApartmentPayment) {
  if (payment.paymentType === "other") {
    return `Способ оплаты: ${payment.paymentMethod || "не указано"}`;
  }

  return `${formatMoney(payment.amount)} руб.`;
}

function getPaymentResponsibleLabel(payment?: ApartmentPayment) {
  if (!payment) {
    return "Ответственный не указан";
  }

  return (
    payment.acceptedBy?.trim() ||
    payment.issuedBy?.trim() ||
    payment.responsibleBy?.trim() ||
    "Ответственный не указан"
  );
}

export default function ApartmentsPage() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [profiles, setProfiles] = useState<StalkerProfile[]>([]);
  const [groups, setGroups] = useState<StalkerGroup[]>([]);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [selectedApartmentId, setSelectedApartmentId] = useState("");
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [tenantSearchQuery, setTenantSearchQuery] = useState("");
  const [paymentDraft, setPaymentDraft] = useState(createEmptyPaymentDraft);
  const [notesDraft, setNotesDraft] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [tenantMessage, setTenantMessage] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [notesMessage, setNotesMessage] = useState("");
  const [tenantPage, setTenantPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);

  useEffect(() => {
    const storageReadHandle = window.setTimeout(() => {
      const storedApartments = normalizeApartments(readStoredCollection<Apartment>(APARTMENTS_STORAGE_KEY, []));

      setProfiles(readStoredCollection<StalkerProfile>(STALKER_PROFILES_STORAGE_KEY, []));
      setGroups(readStoredCollection<StalkerGroup>(STALKER_GROUPS_STORAGE_KEY, []));
      setApartments(storedApartments);
      setSelectedApartmentId("");
      setNotesDraft("");
      setIsStorageReady(true);
    }, 0);

    return () => window.clearTimeout(storageReadHandle);
  }, []);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    writeStoredCollection(APARTMENTS_STORAGE_KEY, apartments);
  }, [apartments, isStorageReady]);

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const selectedApartment = useMemo(() => {
    return apartments.find((apartment) => apartment.id === selectedApartmentId) ?? null;
  }, [apartments, selectedApartmentId]);

  const selectedApartmentTenants = useMemo(() => {
    if (!selectedApartment) {
      return [];
    }

    return selectedApartment.tenants
      .map((tenant) => ({
        tenant,
        profile: profileById.get(tenant.profileId),
      }))
      .filter((item): item is { tenant: (typeof selectedApartment.tenants)[number]; profile: StalkerProfile } =>
        Boolean(item.profile),
      );
  }, [profileById, selectedApartment]);

  const paginatedTenants = getPaginatedItems(selectedApartmentTenants, tenantPage);
  const selectedPayments = selectedApartment ? selectedApartment.payments : [];
  const paginatedPayments = getPaginatedItems(selectedPayments, paymentPage);

  const occupiedTenantIds = selectedApartment
    ? new Set(selectedApartment.tenants.map((tenant) => tenant.profileId))
    : new Set<string>();

  const tenantSearchResults = useMemo(() => {
    const query = tenantSearchQuery.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return profiles
      .filter((profile) =>
        [profile.fullName, profile.callsign, profile.registryNumber]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 12);
  }, [profiles, tenantSearchQuery]);

  const tenantGroupsByProfileId = useMemo(() => {
    const grouped = new Map<string, string[]>();

    groups
      .filter((group) => group.status === "active")
      .forEach((group) => {
        group.members.forEach((member) => {
          const currentGroups = grouped.get(member.stalkerId) ?? [];
          grouped.set(member.stalkerId, [...currentGroups, group.name]);
        });
      });

    return grouped;
  }, [groups]);

  function updateApartment(apartmentId: string, updater: (apartment: Apartment) => Apartment) {
    setApartments((currentApartments) =>
      currentApartments.map((apartment) => {
        if (apartment.id !== apartmentId) {
          return apartment;
        }

        const updatedApartment = updater(apartment);

        return {
          ...updatedApartment,
          status: getApartmentOccupancyStatus(updatedApartment),
          updatedAt: getSystemTimestamp(),
        };
      }),
    );
  }

  function openApartment(apartmentId: string) {
    const apartment = apartments.find((currentApartment) => currentApartment.id === apartmentId);

    setNotesDraft(apartment?.notes ?? "");
    setTenantPage(1);
    setPaymentPage(1);
    setIsEditingNotes(false);
    setTenantMessage("");
    setPaymentMessage("");
    setNotesMessage("");
    setSelectedApartmentId(apartmentId);
  }

  function handleApartmentCardKeyDown(event: KeyboardEvent<HTMLElement>, apartmentId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openApartment(apartmentId);
  }

  function openTenantModal() {
    setSelectedProfileIds([]);
    setSelectedGroupId("");
    setTenantSearchQuery("");
    setTenantMessage("");
    setIsTenantModalOpen(true);
  }

  function closeTenantModal() {
    setIsTenantModalOpen(false);
    setSelectedProfileIds([]);
    setSelectedGroupId("");
    setTenantSearchQuery("");
    setTenantMessage("");
  }

  function toggleProfileSelection(profileId: string) {
    if (occupiedTenantIds.has(profileId)) {
      return;
    }

    setSelectedProfileIds((currentIds) =>
      currentIds.includes(profileId)
        ? currentIds.filter((currentId) => currentId !== profileId)
        : [...currentIds, profileId],
    );
    setTenantMessage("");
  }

  function addSelectedProfiles() {
    if (!selectedApartment) {
      return;
    }

    const existingProfileIds = new Set(selectedApartment.tenants.map((tenant) => tenant.profileId));
    const profileIdsToAdd = selectedProfileIds.filter((profileId) => !existingProfileIds.has(profileId));

    if (profileIdsToAdd.length === 0) {
      setTenantMessage("Выберите профили, которых ещё нет в квартире.");
      return;
    }

    const now = getSystemTimestamp();

    updateApartment(selectedApartment.id, (apartment) => ({
      ...apartment,
      tenants: [
        ...apartment.tenants,
        ...profileIdsToAdd.map((profileId) => ({
          id: `apartment-tenant-${profileId}-${Date.now()}`,
          profileId,
          addedAt: now,
        })),
      ],
    }));
    setTenantMessage("Выбранные профили добавлены в жильцы.");
    setSelectedProfileIds([]);
    addActivityLogEntry({
      type: "apartment",
      title: `Выполнено заселение: ${selectedApartment.name}`,
      status: "OK",
      description: `Добавлено жильцов: ${profileIdsToAdd.length}`,
    });
  }

  function importSelectedGroup() {
    if (!selectedApartment) {
      return;
    }

    const group = groups.find((currentGroup) => currentGroup.id === selectedGroupId);

    if (!group) {
      setTenantMessage("Выберите группу для импорта.");
      return;
    }

    const existingProfileIds = new Set(selectedApartment.tenants.map((tenant) => tenant.profileId));
    const profileIdsToAdd = group.members
      .map((member) => member.stalkerId)
      .filter((profileId) => profileById.has(profileId) && !existingProfileIds.has(profileId));

    if (profileIdsToAdd.length === 0) {
      setTenantMessage("В группе нет новых профилей для заселения.");
      return;
    }

    const now = getSystemTimestamp();

    updateApartment(selectedApartment.id, (apartment) => ({
      ...apartment,
      tenants: [
        ...apartment.tenants,
        ...profileIdsToAdd.map((profileId) => ({
          id: `apartment-tenant-${profileId}-${Date.now()}`,
          profileId,
          addedAt: now,
        })),
      ],
    }));
    setTenantMessage(`Импортировано жильцов: ${profileIdsToAdd.length}.`);
    setSelectedGroupId("");
    addActivityLogEntry({
      type: "apartment",
      title: `Выполнено заселение: ${selectedApartment.name}`,
      status: "OK",
      description: `Импортирована группа: ${group.name}`,
    });
  }

  function evictTenant(tenantId: string) {
    if (!selectedApartment) {
      return;
    }

    const tenant = selectedApartmentTenants.find((currentTenant) => currentTenant.tenant.id === tenantId);

    updateApartment(selectedApartment.id, (apartment) => ({
      ...apartment,
      tenants: apartment.tenants.filter((tenant) => tenant.id !== tenantId),
    }));
    setTenantMessage("Жилец выселен.");
    addActivityLogEntry({
      type: "apartment",
      title: `Жилец выселен: ${selectedApartment.name}`,
      status: "WARN",
      description: tenant ? getProfileTitle(tenant.profile) : "Профиль не найден",
    });
  }

  function requestEvictTenant(tenantId: string) {
    setConfirmDialog({
      title: "Выселить жильца?",
      message: "Жилец будет удалён из этой квартиры.",
      confirmLabel: "Выселить",
      onConfirm: () => evictTenant(tenantId),
    });
  }

  function openTenantProfile(profileId: string) {
    window.location.assign(`/stalkers/profiles?profileId=${encodeURIComponent(profileId)}`);
  }

  function handleTenantCardKeyDown(event: KeyboardEvent<HTMLElement>, profileId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openTenantProfile(profileId);
  }

  function openPaymentModal() {
    setPaymentDraft(createEmptyPaymentDraft());
    setEditingPaymentId("");
    setPaymentMessage("");
    setIsPaymentModalOpen(true);
  }

  function openEditPaymentModal(payment: ApartmentPayment) {
    setPaymentDraft({
      paidAt: payment.paidAt,
      amount: String(payment.amount),
      paymentType: payment.paymentType ?? "money",
      paymentMethod: payment.paymentMethod ?? "",
      paidUntil: payment.paidUntil,
      notes: payment.notes,
    });
    setEditingPaymentId(payment.id);
    setPaymentMessage("");
    setIsPaymentModalOpen(true);
  }

  function closePaymentModal() {
    setPaymentDraft(createEmptyPaymentDraft());
    setEditingPaymentId("");
    setPaymentMessage("");
    setIsPaymentModalOpen(false);
  }

  function updatePaymentDraft<Field extends keyof typeof paymentDraft>(
    field: Field,
    value: (typeof paymentDraft)[Field],
  ) {
    const nextValue =
      typeof value === "string" && (field === "paidAt" || field === "paidUntil")
        ? (forceSystemYear(value) as (typeof paymentDraft)[Field])
        : value;

    setPaymentDraft((currentDraft) => ({ ...currentDraft, [field]: nextValue }));
    setPaymentMessage("");
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedApartment) {
      return;
    }

    const paymentType = paymentDraft.paymentType === "other" ? "other" : "money";
    const amount = paymentType === "money" ? Number(paymentDraft.amount.replace(",", ".")) : 0;
    const paymentMethod = paymentDraft.paymentMethod.trim();

    if (paymentType === "money" && (!Number.isFinite(amount) || amount <= 0)) {
      setPaymentMessage("Укажите корректную сумму оплаты.");
      return;
    }

    if (paymentType === "other" && !paymentMethod) {
      setPaymentMessage("Укажите способ оплаты.");
      return;
    }

    if (!paymentDraft.paidUntil) {
      setPaymentMessage("Укажите дату, до которой оплачено проживание.");
      return;
    }

    if (editingPaymentId) {
      updateApartment(selectedApartment.id, (apartment) => ({
        ...apartment,
        payments: apartment.payments.map((payment) =>
          payment.id === editingPaymentId
            ? {
                ...payment,
                paidAt: paymentDraft.paidAt,
                amount,
                paymentType,
                paymentMethod: paymentType === "other" ? paymentMethod : "",
                paidUntil: paymentDraft.paidUntil,
                notes: paymentDraft.notes.trim(),
              }
            : payment,
        ),
      }));
      closePaymentModal();
      setPaymentMessage("Оплата обновлена.");
      addActivityLogEntry({
        type: "apartment",
        title: `Оплата изменена: ${selectedApartment.name}`,
        status: "OK",
      });
      return;
    }

    const now = getSystemTimestamp();
    const payment: ApartmentPayment = {
      id: `apartment-payment-${Date.now()}`,
      paidAt: paymentDraft.paidAt,
      amount,
      paymentType,
      paymentMethod: paymentType === "other" ? paymentMethod : "",
      paidUntil: paymentDraft.paidUntil,
      notes: paymentDraft.notes.trim(),
      createdAt: now,
    };

    updateApartment(selectedApartment.id, (apartment) => ({
      ...apartment,
      payments: [payment, ...apartment.payments],
    }));
    closePaymentModal();
    setPaymentMessage("Оплата принята.");
    addActivityLogEntry({
      type: "apartment",
      title: `Принята оплата по квартире: ${selectedApartment.name}`,
      status: "OK",
    });
  }

  function deletePayment(paymentId: string) {
    if (!selectedApartment) {
      return;
    }

    updateApartment(selectedApartment.id, (apartment) => ({
      ...apartment,
      payments: apartment.payments.filter((payment) => payment.id !== paymentId),
    }));
    setPaymentMessage("Запись об оплате удалена.");
    addActivityLogEntry({
      type: "apartment",
      title: `Оплата удалена: ${selectedApartment.name}`,
      status: "WARN",
    });
  }

  function requestDeletePayment(paymentId: string) {
    setConfirmDialog({
      title: "Удалить запись об оплате?",
      message: "Запись об оплате будет удалена из истории квартиры.",
      confirmLabel: "Удалить",
      onConfirm: () => deletePayment(paymentId),
    });
  }

  function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedApartment) {
      return;
    }

    updateApartment(selectedApartment.id, (apartment) => ({
      ...apartment,
      notes: notesDraft.trim(),
    }));
    setNotesMessage("Заметки сохранены.");
    setIsEditingNotes(false);
    addActivityLogEntry({
      type: "apartment",
      title: `Изменены заметки квартиры: ${selectedApartment.name}`,
      status: "OK",
    });
  }

  function cancelNotesEditing() {
    setNotesDraft(selectedApartment?.notes ?? "");
    setNotesMessage("");
    setIsEditingNotes(false);
  }

  function renderPaymentBadge(apartment: Apartment) {
    if (apartment.status !== "occupied") {
      return null;
    }

    const status = getApartmentPaymentStatus(getLatestApartmentPayment(apartment));

    return (
      <span className={`task-status-badge badge-chip apartment-payment-status-badge ${getApartmentPaymentBadgeClass(status)}`}>
        {apartmentPaymentStatusLabels[status]}
      </span>
    );
  }

  function renderApartmentList() {
    return (
      <section className="task-section">
        <div className="list-header-block apartments-list-header">
          <div className="column-header list-column-header">
            <div className="profile-column-heading">
              <h2>Реестр квартир</h2>
              <span>{apartments.length} квартиры</span>
            </div>
          </div>
        </div>

        {!isStorageReady ? (
          <div className="empty-state">
            <p>Загрузка локальных данных...</p>
          </div>
        ) : (
          <div className="profile-list apartment-profile-list">
            {apartments.map((apartment) => {
              const latestPayment = getLatestApartmentPayment(apartment);

              return (
                <article
                  className={`profile-list-item apartment-list-card ${apartment.id === selectedApartmentId ? "profile-list-item-active apartment-list-card-active" : ""}`}
                  key={apartment.id}
                  onClick={() => openApartment(apartment.id)}
                  onKeyDown={(event) => handleApartmentCardKeyDown(event, apartment.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="apartment-list-card-head">
                    <div className="apartment-list-card-title-row">
                      <strong>{apartment.name}</strong>
                      <div className="apartment-list-badges">
                        <span className={`task-status-badge badge-chip apartment-occupancy-badge ${apartment.status === "occupied" ? "badge-state-group" : "badge-neutral"}`}>
                          {apartmentStatusLabels[apartment.status]}
                        </span>
                        {renderPaymentBadge(apartment)}
                      </div>
                    </div>
                    <span className="apartment-list-card-divider" aria-hidden="true" />
                  </div>
                  <div className="apartment-list-metrics">
                    <div className="apartment-list-row">
                      <span className="apartment-list-metric-label">Жильцов</span>
                      <strong className="apartment-list-metric-value">{apartment.tenants.length}</strong>
                    </div>
                    <div className="apartment-list-row">
                      <span className="apartment-list-metric-label">Последняя оплата</span>
                      <strong className="apartment-list-metric-value">{latestPayment ? getPaymentDisplay(latestPayment) : "нет записей"}</strong>
                    </div>
                    <div className="apartment-list-row">
                      <span className="apartment-list-metric-label">Оплачено до</span>
                      <strong className="apartment-list-metric-value">{latestPayment ? formatDate(latestPayment.paidUntil) : "не указано"}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function renderApartmentProfile() {
    if (!selectedApartment) {
      return null;
    }

    const latestPayment = getLatestApartmentPayment(selectedApartment);
    return (
      <div className="apartment-detail">
        <div className="profile-case-card apartment-case-card apartment-hero-card">
          <div className="profile-case-main">
            <div className="apartment-profile-header">
              <div className="profile-case-title apartment-profile-title">
                <h3>{selectedApartment.name}</h3>
                <p>Профиль квартиры: жильцы, оплата и служебные заметки.</p>
              </div>

              <div className="apartment-profile-controls">
                <div className="profile-badges apartment-profile-badges">
                  <span className={`profile-badge badge-chip apartment-occupancy-badge ${selectedApartment.status === "occupied" ? "badge-state-group" : "badge-neutral"}`}>
                    {apartmentStatusLabels[selectedApartment.status]}
                  </span>
                  {renderPaymentBadge(selectedApartment)}
                  <span className="profile-badge badge-chip badge-neutral apartment-count-badge">Жильцов: {selectedApartment.tenants.length}</span>
                </div>
              </div>
            </div>

            <div className="profile-quick-facts apartment-summary-facts">
              <div>
                <span>Жильцов</span>
                <strong>{selectedApartment.tenants.length}</strong>
              </div>
              <div title={`Кто принял оплату: ${getPaymentResponsibleLabel(latestPayment)}`}>
                <span>Последняя оплата</span>
                <strong>{latestPayment ? getPaymentDisplay(latestPayment) : "Нет записей"}</strong>
              </div>
              <div title={`Кто принял оплату: ${getPaymentResponsibleLabel(latestPayment)}`}>
                <span>Оплачено до</span>
                <strong>{latestPayment ? formatDate(latestPayment.paidUntil) : "Не указано"}</strong>
              </div>
            </div>

            <section className="apartment-hero-notes">
              <div className="task-section-header apartment-notes-header">
                <span>Заметки квартиры</span>
                {!isEditingNotes ? (
                  <button className="command-row task-action-button" onClick={() => setIsEditingNotes(true)} type="button">
                    Редактировать заметки
                  </button>
                ) : null}
              </div>

              {isEditingNotes ? (
                <form className="apartment-notes-form" onSubmit={saveNotes}>
                  <label className="filter-field">
                    <textarea
                      className="apartment-notes-textarea"
                      onChange={(event) => {
                        setNotesDraft(event.target.value);
                        setNotesMessage("");
                      }}
                      placeholder="Служебные заметки по квартире"
                      value={notesDraft}
                    />
                  </label>
                  <div className="apartment-notes-actions">
                    <button className="command-row task-action-button" onClick={cancelNotesEditing} type="button">
                      Отмена
                    </button>
                    <button className="command-row task-action-button" type="submit">
                      Сохранить
                    </button>
                  </div>
                </form>
              ) : (
                <div className="apartment-notes-view">
                  <p className="apartment-notes-text">{selectedApartment.notes || "Заметок нет."}</p>
                </div>
              )}

              {notesMessage ? <p className="table-message">{notesMessage}</p> : null}
            </section>
          </div>
        </div>

        <div className="apartment-records-area">
          <section className="task-section apartment-section-block">
            <div className="task-section-header">
              <span>Жильцы</span>
              <button className="command-row" onClick={openTenantModal} type="button">
                Добавить жильцов
              </button>
            </div>

            {tenantMessage ? <p className="table-message">{tenantMessage}</p> : null}

            <div className="relation-list detailed-member-list apartment-tenant-list">
              {paginatedTenants.items.length > 0 ? (
                paginatedTenants.items.map(({ tenant, profile }) => {
                  const secondaryTitle = getProfileSecondaryTitle(profile);
                  const tenantGroupNames = tenantGroupsByProfileId.get(profile.id) ?? [];

                  return (
                    <div
                      className="relation-row detailed-member-row apartment-tenant-row"
                      key={tenant.id}
                      onClick={() => openTenantProfile(profile.id)}
                      onKeyDown={(event) => handleTenantCardKeyDown(event, profile.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="member-avatar">
                        {profile.photoUrl ? <img alt="Аватар жильца" src={profile.photoUrl} /> : getProfileInitials(profile)}
                      </div>
                      <div className="member-identity">
                        <div className="apartment-tenant-title-row">
                          <strong>{getProfileTitle(profile)}</strong>
                          <span className={`profile-affiliation-badge badge-chip ${getAffiliationBadgeClass(profile.affiliation)}`}>
                            {getAffiliationLabel(profile.affiliation)}
                          </span>
                          {tenantGroupNames.length > 0 ? (
                            <>
                              {tenantGroupNames.map((groupName) => (
                                <span className="profile-state-badge badge-chip badge-state-group apartment-tenant-group-badge" key={groupName}>
                                  В группе: {groupName}
                                </span>
                              ))}
                            </>
                          ) : null}
                        </div>
                        <span>{secondaryTitle || profile.fullName || "ФИО не указано"}</span>
                        <span>Заселён: {formatDate(tenant.addedAt)}</span>
                      </div>
                      <div className="task-actions">
                        <button
                          className="command-row task-action-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            requestEvictTenant(tenant.id);
                          }}
                          type="button"
                        >
                          Выселить
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <p>Жильцов пока нет.</p>
                </div>
              )}
            </div>

            <Pagination
              page={paginatedTenants.page}
              pageCount={paginatedTenants.pageCount}
              onPageChange={setTenantPage}
            />
          </section>

          <section className="task-section apartment-section-block">
            <div className="task-section-header">
              <span>Оплата</span>
              <button className="command-row" onClick={openPaymentModal} type="button">
                Принять оплату
              </button>
            </div>

            {paymentMessage ? <p className="table-message">{paymentMessage}</p> : null}

            <div className="task-list apartment-payment-list">
              {paginatedPayments.items.length > 0 ? (
                paginatedPayments.items.map((payment) => {
                  const status = getApartmentPaymentStatus(payment);

                  return (
                    <article className="task-item apartment-payment-card" key={payment.id}>
                      <div className="task-item-row">
                        <div className="task-item-mainline">
                          <strong>{getPaymentDisplay(payment)}</strong>
                          <span className={`task-status-badge badge-chip apartment-payment-status-badge ${getApartmentPaymentBadgeClass(status)}`}>
                            {apartmentPaymentStatusLabels[status]}
                          </span>
                        </div>
                        <div className="task-actions">
                          <button className="command-row task-action-button" onClick={() => openEditPaymentModal(payment)} type="button">
                            Редактировать
                          </button>
                          <button className="command-row task-action-button" onClick={() => requestDeletePayment(payment.id)} type="button">
                            Удалить
                          </button>
                        </div>
                      </div>
                      <dl className="task-meta-strip apartment-payment-strip">
                        <div>
                          <dt>Дата оплаты</dt>
                          <dd>{formatDate(payment.paidAt)}</dd>
                        </div>
                        <div>
                          <dt>{payment.paymentType === "other" ? "Способ оплаты" : "Сумма"}</dt>
                          <dd>{getPaymentDisplay(payment)}</dd>
                        </div>
                        <div>
                          <dt>Оплачено до</dt>
                          <dd>{formatDate(payment.paidUntil)}</dd>
                        </div>
                      </dl>

                      {payment.notes ? (
                        <div className="profile-notes-wide apartment-payment-notes">
                          <span>Заметки</span>
                          <p>{payment.notes}</p>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="empty-state apartment-payment-empty">
                  <p>Оплат пока нет.</p>
                  <span>После принятия оплаты запись появится в этом блоке.</span>
                </div>
              )}
            </div>

            <Pagination
              page={paginatedPayments.page}
              pageCount={paginatedPayments.pageCount}
              onPageChange={setPaymentPage}
            />
          </section>
        </div>
      </div>
    );
  }

  return (
    <main className="pda-page apartments-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Сталкеры" activeSubtabLabel="Квартиры" />

        <div className="pda-content">
          <section className="section-panel apartments-workspace-panel">
            <div className="profile-card-grid apartments-two-column-layout">
              <section className="profile-column apartments-list-column">
                {renderApartmentList()}
              </section>
              <section className="profile-column detail-host-column apartments-detail-column">
                {selectedApartment ? (
                  renderApartmentProfile()
                ) : (
                  <div className="empty-state profile-detail-empty apartment-detail-empty">
                    <p>Выберите квартиру из списка слева.</p>
                    <span>Здесь появятся жильцы, оплаты и заметки выбранной квартиры.</span>
                  </div>
                )}
              </section>
            </div>
          </section>
        </div>
      </section>

      {isTenantModalOpen && selectedApartment ? (
        <div className="pda-modal-backdrop">
          <div className="pda-modal task-modal">
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Добавить жильцов</h1>
                <p>{selectedApartment.name}: отдельные профили или состав группы</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Сталкерские профили</h2>
                  <span>Найдите одного или нескольких жильцов</span>
                </div>

                <label className="filter-field task-form-wide">
                  <span>Поиск сталкера</span>
                  <input
                    onChange={(event) => {
                      setTenantSearchQuery(event.target.value);
                      setSelectedProfileIds([]);
                      setTenantMessage("");
                    }}
                    placeholder="ФИО, позывной или внутренний номер"
                    type="text"
                    value={tenantSearchQuery}
                  />
                </label>

                <div className="apartment-checkbox-list">
                  {!tenantSearchQuery.trim() ? (
                    <div className="empty-state compact-empty-state">
                      <p>Введите ФИО, позывной или номер сталкера для поиска.</p>
                    </div>
                  ) : tenantSearchResults.length > 0 ? (
                    tenantSearchResults.map((profile) => {
                      const isOccupied = occupiedTenantIds.has(profile.id);

                      return (
                      <label className={`group-member-edit-row apartment-checkbox-row ${isOccupied ? "apartment-checkbox-row-disabled" : ""}`} key={profile.id}>
                        <span>
                          <strong>{getProfileTitle(profile)}</strong>
                          <span>
                            {getProfileSecondaryTitle(profile) || getAffiliationLabel(profile.affiliation)}
                            {isOccupied ? " · Уже заселён" : ""}
                          </span>
                        </span>
                        <input
                          checked={selectedProfileIds.includes(profile.id)}
                          disabled={isOccupied}
                          onChange={() => toggleProfileSelection(profile.id)}
                          type="checkbox"
                        />
                      </label>
                      );
                    })
                  ) : (
                    <div className="empty-state">
                      <p>Профили не найдены.</p>
                    </div>
                  )}
                </div>

                <button className="command-row tenant-modal-command" onClick={addSelectedProfiles} type="button">
                  Добавить выбранные профили
                </button>
              </section>

              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Импорт группы</h2>
                  <span>В жильцы попадут участники группы как отдельные профили</span>
                </div>
                <div className="task-form-grid">
                  <label className="filter-field task-form-wide">
                    <span>Группа сталкеров</span>
                    <select onChange={(event) => setSelectedGroupId(event.target.value)} value={selectedGroupId}>
                      <option value="">Выберите группу</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="command-row tenant-modal-command" onClick={importSelectedGroup} type="button">
                  Импортировать состав группы
                </button>
              </section>
            </div>

            <div className="modal-message-slot">
              {tenantMessage ? <p className="draft-message">{tenantMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closeTenantModal} type="button">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPaymentModalOpen && selectedApartment ? (
        <div className="pda-modal-backdrop">
          <form className="pda-modal task-modal" onSubmit={submitPayment}>
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>{editingPaymentId ? "Редактирование оплаты" : "Принять оплату"}</h1>
                <p>{selectedApartment.name}: запись оплаты проживания</p>
              </div>
            </div>

            <div className="modal-body">
              <section className="form-section">
                <div className="form-section-heading">
                  <h2>Данные оплаты</h2>
                  <span>Дата, сумма и срок действия оплаты</span>
                </div>
                <div className="payment-form-stack">
                  <label className="filter-field">
                    <span>Дата оплаты</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updatePaymentDraft("paidAt", event.target.value)} type="date" value={paymentDraft.paidAt} />
                  </label>
                  <label className="filter-field">
                    <span>Оплачено до</span>
                    <input max={SYSTEM_DATE_MAX} min={SYSTEM_DATE_MIN} onChange={(event) => updatePaymentDraft("paidUntil", event.target.value)} type="date" value={paymentDraft.paidUntil} />
                  </label>
                  <label className="apartment-payment-toggle">
                    <input
                      checked={paymentDraft.paymentType === "other"}
                      onChange={(event) => updatePaymentDraft("paymentType", event.target.checked ? "other" : "money")}
                      type="checkbox"
                    />
                    <span>Оплачено другим способом</span>
                  </label>
                  {paymentDraft.paymentType === "other" ? (
                    <label className="filter-field">
                      <span>Способ оплаты</span>
                      <input
                        onChange={(event) => updatePaymentDraft("paymentMethod", event.target.value)}
                        placeholder="Бартер, хабар, услуга или иное"
                        type="text"
                        value={paymentDraft.paymentMethod}
                      />
                    </label>
                  ) : (
                    <label className="filter-field">
                      <span>Сумма оплаты</span>
                      <input min="0" onChange={(event) => updatePaymentDraft("amount", event.target.value)} type="number" value={paymentDraft.amount} />
                    </label>
                  )}
                  <label className="filter-field">
                    <span>Заметки</span>
                    <textarea onChange={(event) => updatePaymentDraft("notes", event.target.value)} placeholder="Комментарий к оплате" value={paymentDraft.notes} />
                  </label>
                </div>
              </section>
            </div>

            <div className="modal-message-slot">
              {paymentMessage ? <p className="draft-message">{paymentMessage}</p> : null}
            </div>

            <div className="modal-actions">
              <button className="command-row" onClick={closePaymentModal} type="button">
                Отмена
              </button>
              <button className="primary-command" type="submit">
                {editingPaymentId ? "Сохранить изменения" : "Сохранить оплату"}
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
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
        />
      ) : null}
    </main>
  );
}
