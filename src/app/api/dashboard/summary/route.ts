import { getPrismaClient } from "@/lib/prisma";
import { getSystemToday } from "@/lib/stalker-utils";
import type { DashboardSummaryResponse } from "@/lib/dashboard-summary";
import { requireApiAuth } from "@/lib/auth/require-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_FALLBACK_LABEL = "Исполнитель не указан";
const TRADE_FALLBACK_LABEL = "Участник не указан";
const VIOLATION_FALLBACK_LABEL = "Нарушитель не указан";

function getProfileLabel(profile?: { callsign: string; fullName: string } | null) {
  if (!profile) {
    return "";
  }

  return profile.callsign.trim() || profile.fullName.trim();
}

function getTaskAssigneeLabel(task: {
  manualAssigneeName: string | null;
  stalker: { callsign: string; fullName: string } | null;
  group: { name: string } | null;
}) {
  return task.group?.name?.trim() || getProfileLabel(task.stalker) || task.manualAssigneeName?.trim() || TASK_FALLBACK_LABEL;
}

function getTradeParticipantLabel(operation: {
  manualParticipantName: string | null;
  stalker: { callsign: string; fullName: string } | null;
  group: { name: string } | null;
}) {
  return (
    operation.group?.name?.trim() ||
    getProfileLabel(operation.stalker) ||
    operation.manualParticipantName?.trim() ||
    TRADE_FALLBACK_LABEL
  );
}

function getViolationLabel(violation: {
  manualViolatorName: string | null;
  profile: { callsign: string; fullName: string } | null;
}) {
  return getProfileLabel(violation.profile) || violation.manualViolatorName?.trim() || VIOLATION_FALLBACK_LABEL;
}

function getApartmentPaymentStatus(paidUntil: Date | null, today: Date) {
  if (!paidUntil) {
    return "none" as const;
  }

  const normalizedPaidUntil = new Date(paidUntil);
  normalizedPaidUntil.setHours(0, 0, 0, 0);

  if (normalizedPaidUntil.getTime() < today.getTime()) {
    return "overdue" as const;
  }

  const daysLeft = Math.ceil((normalizedPaidUntil.getTime() - today.getTime()) / 86_400_000);
  return daysLeft <= 3 ? ("expiring" as const) : ("paid" as const);
}

export async function GET() {
  const auth = await requireApiAuth();

  if (!auth.ok) {
    return auth.response;
  }

  const prisma = getPrismaClient();
  const today = getSystemToday();
  today.setHours(0, 0, 0, 0);

  const [
    activeProfilesCount,
    archivedProfilesCount,
    activeGroupsCount,
    archivedGroupsCount,
    activeTasksCount,
    completedTasksCount,
    cancelledTasksCount,
    activeViolationsCount,
    closedViolationsCount,
    salesAggregate,
    purchasesAggregate,
    overdueTaskCount,
    apartments,
    recentTasks,
    recentTradeOperations,
    recentViolations,
  ] = await prisma.$transaction([
    prisma.stalker.count({
      where: { status: "active" },
    }),
    prisma.stalker.count({
      where: { status: "archive" },
    }),
    prisma.stalkerGroup.count({
      where: { status: "active" },
    }),
    prisma.stalkerGroup.count({
      where: { status: "archive" },
    }),
    prisma.task.count({
      where: { status: "active" },
    }),
    prisma.task.count({
      where: { status: "completed" },
    }),
    prisma.task.count({
      where: { status: "cancelled" },
    }),
    prisma.violation.count({
      where: { status: "active" },
    }),
    prisma.violation.count({
      where: { status: "closed" },
    }),
    prisma.tradeOperation.aggregate({
      where: { type: "sale" },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.tradeOperation.aggregate({
      where: { type: "purchase" },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.task.count({
      where: {
        dueAt: { lt: today },
        status: "active",
      },
    }),
    prisma.apartment.findMany({
      select: {
        status: true,
        payments: {
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          select: {
            paidUntil: true,
          },
          take: 1,
        },
      },
    }),
    prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        description: true,
        dueAt: true,
        issuedAt: true,
        manualAssigneeName: true,
        status: true,
        group: {
          select: {
            name: true,
          },
        },
        stalker: {
          select: {
            callsign: true,
            fullName: true,
          },
        },
      },
      take: 5,
    }),
    prisma.tradeOperation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        manualParticipantName: true,
        operationDate: true,
        totalAmount: true,
        type: true,
        group: {
          select: {
            name: true,
          },
        },
        stalker: {
          select: {
            callsign: true,
            fullName: true,
          },
        },
      },
      take: 5,
    }),
    prisma.violation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        date: true,
        description: true,
        manualViolatorName: true,
        status: true,
        profile: {
          select: {
            callsign: true,
            fullName: true,
          },
        },
      },
      take: 5,
    }),
  ]);

  const apartmentSummary = apartments.reduce(
    (summary, apartment) => {
      if (apartment.status === "occupied") {
        summary.occupied += 1;
      } else {
        summary.free += 1;
      }

      const paymentStatus = getApartmentPaymentStatus(apartment.payments[0]?.paidUntil ?? null, today);

      if (paymentStatus === "overdue") {
        summary.overduePayments += 1;
      }

      if (paymentStatus === "expiring") {
        summary.expiringPayments += 1;
      }

      return summary;
    },
    {
      expiringPayments: 0,
      free: 0,
      occupied: 0,
      overduePayments: 0,
      total: apartments.length,
    },
  );

  const response: DashboardSummaryResponse = {
    profiles: {
      active: activeProfilesCount,
      archive: archivedProfilesCount,
      total: activeProfilesCount + archivedProfilesCount,
    },
    groups: {
      active: activeGroupsCount,
      archive: archivedGroupsCount,
      total: activeGroupsCount + archivedGroupsCount,
    },
    apartments: apartmentSummary,
    tasks: {
      active: activeTasksCount,
      completed: completedTasksCount,
      cancelled: cancelledTasksCount,
      overdue: overdueTaskCount,
      total: activeTasksCount + completedTasksCount + cancelledTasksCount,
    },
    violations: {
      active: activeViolationsCount,
      closed: closedViolationsCount,
      total: activeViolationsCount + closedViolationsCount,
    },
    trade: {
      salesCount: salesAggregate._count._all,
      purchasesCount: purchasesAggregate._count._all,
      salesTotal: salesAggregate._sum.totalAmount ?? 0,
      purchasesTotal: purchasesAggregate._sum.totalAmount ?? 0,
    },
    recent: {
      tasks: recentTasks.map((task) => ({
        id: task.id,
        description: task.description,
        status: task.status,
        dueAt: task.dueAt ? task.dueAt.toISOString() : null,
        issuedAt: task.issuedAt.toISOString(),
        assigneeLabel: getTaskAssigneeLabel(task),
      })),
      tradeOperations: recentTradeOperations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        totalAmount: operation.totalAmount,
        operationDate: operation.operationDate ? operation.operationDate.toISOString() : null,
        participantLabel: getTradeParticipantLabel(operation),
      })),
      violations: recentViolations.map((violation) => ({
        id: violation.id,
        description: violation.description,
        status: violation.status,
        date: violation.date.toISOString(),
        violatorLabel: getViolationLabel(violation),
      })),
    },
  };

  return Response.json(response);
}
