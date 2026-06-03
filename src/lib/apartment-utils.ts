import { getSystemTimestamp, getSystemToday } from "./stalker-utils";
import type { Apartment, ApartmentPayment, ApartmentPaymentStatus, ApartmentStatus } from "./types";

export const apartmentPaymentStatusLabels: Record<ApartmentPaymentStatus, string> = {
  none: "Нет оплаты",
  paid: "Оплачено",
  expiring: "Истекает",
  overdue: "Просрочено",
};

export const apartmentStatusLabels: Record<ApartmentStatus, string> = {
  free: "Свободна",
  occupied: "Занята",
};

export function createDefaultApartments(now = getSystemTimestamp()): Apartment[] {
  return [1, 2].map((number) => ({
    id: `apartment-${number}`,
    name: `Квартира ${number}`,
    status: "free",
    tenants: [],
    payments: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  }));
}

export function getApartmentOccupancyStatus(apartment: Apartment): ApartmentStatus {
  return apartment.tenants.length > 0 ? "occupied" : "free";
}

export function getLatestApartmentPayment(apartment: Apartment) {
  return [...apartment.payments].sort((left, right) => {
    const leftDate = left.paidAt || left.createdAt;
    const rightDate = right.paidAt || right.createdAt;

    return new Date(rightDate).getTime() - new Date(leftDate).getTime();
  })[0];
}

export function getApartmentPaymentStatus(payment?: ApartmentPayment): ApartmentPaymentStatus {
  if (!payment) {
    return "none";
  }

  const today = getSystemToday();
  today.setHours(0, 0, 0, 0);

  const paidUntil = new Date(payment.paidUntil);
  paidUntil.setHours(0, 0, 0, 0);

  if (paidUntil.getTime() < today.getTime()) {
    return "overdue";
  }

  const daysLeft = Math.ceil((paidUntil.getTime() - today.getTime()) / 86_400_000);

  return daysLeft <= 3 ? "expiring" : "paid";
}

export function getApartmentPaymentBadgeClass(status: ApartmentPaymentStatus) {
  const classMap: Record<ApartmentPaymentStatus, string> = {
    none: "badge-neutral",
    paid: "badge-task-completed",
    expiring: "badge-task-active",
    overdue: "badge-task-overdue",
  };

  return classMap[status];
}

export function normalizeApartments(apartments: Apartment[]): Apartment[] {
  if (apartments.length === 0) {
    return createDefaultApartments();
  }

  const defaults = createDefaultApartments();

  return defaults.map((defaultApartment, index) => {
    const storedApartment = apartments[index];

    if (!storedApartment) {
      return defaultApartment;
    }

    return {
      ...defaultApartment,
      ...storedApartment,
      tenants: storedApartment.tenants ?? [],
      payments: storedApartment.payments ?? [],
      status: storedApartment.tenants?.length ? ("occupied" as const) : ("free" as const),
    };
  });
}
