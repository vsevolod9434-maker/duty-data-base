"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetchJson } from "@/lib/api-client";
import { getApartmentPaymentStatus, getLatestApartmentPayment } from "@/lib/apartment-utils";
import { useCurrentUserCacheKey } from "@/lib/data-cache";
import { getTodayDate, isTaskOverdue } from "@/lib/stalker-utils";
import { getTradeItemsSummary } from "@/lib/trade-draft";
import type { Apartment, StalkerGroup, StalkerProfile, Task, TradeOperation, Violation } from "@/lib/types";

type DashboardData = {
  profiles: StalkerProfile[];
  groups: StalkerGroup[];
  tasks: Task[];
  tradeOperations: TradeOperation[];
  violations: Violation[];
  apartments: Apartment[];
};

const ATTENTION_LIMIT = 6;
const RECENT_LIMIT = 5;

async function fetchDashboardData(): Promise<DashboardData> {
  const [profiles, groups, tasks, tradeOperations, violations, apartments] = await Promise.all([
    apiFetchJson<StalkerProfile[]>("/api/stalkers", { cache: "no-store" }),
    apiFetchJson<StalkerGroup[]>("/api/stalker-groups", { cache: "no-store" }),
    apiFetchJson<Task[]>("/api/tasks", { cache: "no-store" }),
    apiFetchJson<TradeOperation[]>("/api/trade-operations", { cache: "no-store" }),
    apiFetchJson<Violation[]>("/api/violations", { cache: "no-store" }),
    apiFetchJson<Apartment[]>("/api/apartments", { cache: "no-store" }),
  ]);

  return { profiles, groups, tasks, tradeOperations, violations, apartments };
}

function formatDate(value?: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "—";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} руб.`;
}

function getProfileLabel(profile?: StalkerProfile) {
  return profile ? profile.callsign?.trim() || profile.fullName?.trim() || "Без имени" : "";
}

function sortByDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => (getDate(right) ?? "").localeCompare(getDate(left) ?? ""));
}

export function DutyDashboard() {
  const { currentUserKey } = useCurrentUserCacheKey();
  const dashboardQuery = useQuery({
    enabled: Boolean(currentUserKey),
    queryKey: ["duty-data", currentUserKey ?? "pending", "dashboard"],
    queryFn: fetchDashboardData,
  });

  if (dashboardQuery.isError) {
    return (
      <div className="dashboard-state">
        <p>Не удалось загрузить сводку.</p>
        <button className="command-row" onClick={() => void dashboardQuery.refetch()} type="button">
          Повторить
        </button>
      </div>
    );
  }

  if (!dashboardQuery.data) {
    return (
      <div className="dashboard-state">
        <p>Загрузка сводки…</p>
      </div>
    );
  }

  const { profiles, groups, tasks, tradeOperations, violations, apartments } = dashboardQuery.data;
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const getTaskAssignee = (task: Task) =>
    (task.groupId ? groupById.get(task.groupId)?.name : "") ||
    getProfileLabel(task.stalkerId ? profileById.get(task.stalkerId) : undefined) ||
    task.manualAssigneeName ||
    "Исполнитель не указан";
  const getTradeParticipant = (operation: TradeOperation) =>
    (operation.groupId ? groupById.get(operation.groupId)?.name : "") ||
    getProfileLabel(operation.stalkerId ? profileById.get(operation.stalkerId) : undefined) ||
    operation.manualParticipantName ||
    "Участник не указан";
  const getViolator = (violation: Violation) =>
    getProfileLabel(violation.profileId ? profileById.get(violation.profileId) : undefined) ||
    violation.manualViolatorName ||
    "Нарушитель не указан";

  const activeProfiles = profiles.filter((profile) => profile.status === "active").length;
  const activeGroups = groups.filter((group) => group.status === "active").length;
  const activeTasks = tasks.filter((task) => task.status === "active");
  const overdueTasks = sortByDateDesc(tasks.filter(isTaskOverdue), (task) => task.dueAt).reverse();
  const activeViolations = sortByDateDesc(
    violations.filter((violation) => (violation.status ?? "active") === "active"),
    (violation) => violation.date,
  );
  const sales = tradeOperations.filter((operation) => operation.type === "sale");
  const purchases = tradeOperations.filter((operation) => operation.type === "purchase");
  const salesTotal = sales.reduce((sum, operation) => sum + operation.totalAmount, 0);
  const purchasesTotal = purchases.reduce((sum, operation) => sum + operation.totalAmount, 0);
  const apartmentRows = apartments.map((apartment) => {
    const latestPayment = getLatestApartmentPayment(apartment);
    return { apartment, latestPayment, paymentStatus: getApartmentPaymentStatus(latestPayment) };
  });
  const occupiedApartments = apartmentRows.filter((row) => row.apartment.tenants.length > 0).length;
  const paymentAlerts = apartmentRows.filter(
    (row) => row.apartment.tenants.length > 0 && (row.paymentStatus === "overdue" || row.paymentStatus === "expiring" || row.paymentStatus === "none"),
  );

  const attentionCount = overdueTasks.length + paymentAlerts.length + activeViolations.length;
  const recentTasks = sortByDateDesc(tasks, (task) => task.issuedAt).slice(0, RECENT_LIMIT);
  const recentTrade = sortByDateDesc(tradeOperations, (operation) => operation.operationDate ?? operation.createdAt).slice(0, RECENT_LIMIT);

  const counters = [
    {
      label: "Сталкеры",
      value: activeProfiles,
      note: `в архиве: ${profiles.length - activeProfiles}`,
      href: "/stalkers/profiles",
      isAlert: false,
    },
    { label: "Группы", value: activeGroups, note: `в архиве: ${groups.length - activeGroups}`, href: "/stalkers/groups", isAlert: false },
    {
      label: "Квартиры",
      value: `${occupiedApartments}/${apartments.length}`,
      note: paymentAlerts.length > 0 ? `оплата: требует внимания ${paymentAlerts.length}` : "оплата в порядке",
      href: "/apartments",
      isAlert: paymentAlerts.length > 0,
    },
    {
      label: "Задания",
      value: activeTasks.length,
      note: overdueTasks.length > 0 ? `просрочено: ${overdueTasks.length}` : "просроченных нет",
      href: "/journals?tab=tasks",
      isAlert: overdueTasks.length > 0,
    },
    {
      label: "Нарушения",
      value: activeViolations.length,
      note: `всего: ${violations.length}`,
      href: "/journals?tab=violations",
      isAlert: activeViolations.length > 0,
    },
    {
      label: "Торговля",
      value: tradeOperations.length,
      note: `продажи ${formatMoney(salesTotal)} · покупки ${formatMoney(purchasesTotal)}`,
      href: "/journals?tab=sales",
      isAlert: false,
    },
  ];

  return (
    <div className="dashboard">
      <p className="dashboard-date">Системная дата: {formatDate(getTodayDate())}</p>
      <section aria-label="Показатели" className="dashboard-counters">
        {counters.map((counter) => (
          <Link className={`dashboard-counter ${counter.isAlert ? "dashboard-counter-alert" : ""}`} href={counter.href} key={counter.label}>
            <span className="dashboard-counter-label">{counter.label}</span>
            <strong className="dashboard-counter-value">{counter.value}</strong>
            <span className="dashboard-counter-note" title={counter.note}>
              {counter.note}
            </span>
          </Link>
        ))}
      </section>

      <div className="dashboard-columns">
        <section aria-labelledby="dashboard-attention-title" className="dashboard-panel dashboard-panel-attention">
          <header className="dashboard-panel-head">
            <h2 id="dashboard-attention-title">Требует внимания</h2>
            <span>{attentionCount > 0 ? `записей: ${attentionCount}` : "замечаний нет"}</span>
          </header>

          {attentionCount === 0 ? <p className="dashboard-empty">Просроченных заданий, долгов по оплате и активных нарушений нет.</p> : null}

          {overdueTasks.length > 0 ? (
            <div className="dashboard-list">
              <h3>Просроченные задания</h3>
              {overdueTasks.slice(0, ATTENTION_LIMIT).map((task) => (
                <Link className="dashboard-row" href="/journals?tab=tasks" key={task.id}>
                  <span className="dashboard-row-date dashboard-row-date-alert">{formatDate(task.dueAt)}</span>
                  <span className="dashboard-row-main">{task.description || "Описание не указано"}</span>
                  <span className="dashboard-row-meta">{getTaskAssignee(task)}</span>
                </Link>
              ))}
              {overdueTasks.length > ATTENTION_LIMIT ? (
                <Link className="dashboard-more" href="/journals?tab=tasks">
                  Ещё {overdueTasks.length - ATTENTION_LIMIT} в журнале заданий
                </Link>
              ) : null}
            </div>
          ) : null}

          {paymentAlerts.length > 0 ? (
            <div className="dashboard-list">
              <h3>Оплата квартир</h3>
              {paymentAlerts.map(({ apartment, latestPayment, paymentStatus }) => (
                <Link className="dashboard-row" href="/apartments" key={apartment.id}>
                  <span className={`dashboard-row-date ${paymentStatus === "expiring" ? "" : "dashboard-row-date-alert"}`}>
                    {latestPayment ? formatDate(latestPayment.paidUntil) : "—"}
                  </span>
                  <span className="dashboard-row-main">{apartment.name}</span>
                  <span className="dashboard-row-meta">
                    {paymentStatus === "overdue" ? "Просрочено" : paymentStatus === "expiring" ? "Истекает" : "Нет оплаты"}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          {activeViolations.length > 0 ? (
            <div className="dashboard-list">
              <h3>Активные нарушения</h3>
              {activeViolations.slice(0, ATTENTION_LIMIT).map((violation) => (
                <Link className="dashboard-row" href="/journals?tab=violations" key={violation.id}>
                  <span className="dashboard-row-date">{formatDate(violation.date)}</span>
                  <span className="dashboard-row-main">{violation.description || "Описание не указано"}</span>
                  <span className="dashboard-row-meta">{getViolator(violation)}</span>
                </Link>
              ))}
              {activeViolations.length > ATTENTION_LIMIT ? (
                <Link className="dashboard-more" href="/journals?tab=violations">
                  Ещё {activeViolations.length - ATTENTION_LIMIT} в журнале нарушений
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>

        <section aria-labelledby="dashboard-recent-title" className="dashboard-panel">
          <header className="dashboard-panel-head">
            <h2 id="dashboard-recent-title">Последние записи</h2>
            <span>по дате</span>
          </header>

          <div className="dashboard-list">
            <h3>Задания</h3>
            {recentTasks.length > 0 ? (
              recentTasks.map((task) => (
                <Link className="dashboard-row" href="/journals?tab=tasks" key={task.id}>
                  <span className="dashboard-row-date">{formatDate(task.issuedAt)}</span>
                  <span className="dashboard-row-main">{task.description || "Описание не указано"}</span>
                  <span className="dashboard-row-meta">{getTaskAssignee(task)}</span>
                </Link>
              ))
            ) : (
              <p className="dashboard-empty">Заданий нет.</p>
            )}
          </div>

          <div className="dashboard-list">
            <h3>Продажи и покупки</h3>
            {recentTrade.length > 0 ? (
              recentTrade.map((operation) => (
                <Link
                  className="dashboard-row"
                  href={operation.type === "sale" ? "/journals?tab=sales" : "/journals?tab=purchases"}
                  key={operation.id}
                >
                  <span className="dashboard-row-date">{formatDate(operation.operationDate ?? operation.createdAt)}</span>
                  <span className="dashboard-row-main">
                    {operation.type === "sale" ? "Продажа" : "Покупка"} · {getTradeItemsSummary(operation.items)}
                  </span>
                  <span className="dashboard-row-meta">
                    {getTradeParticipant(operation)} · {formatMoney(operation.totalAmount)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="dashboard-empty">Торговых операций нет.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
