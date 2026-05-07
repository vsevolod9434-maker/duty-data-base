"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/ui/PdaPatterns";
import { apiFetchJson } from "@/lib/api-client";
import type { DashboardSummaryResponse } from "@/lib/dashboard-summary";

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} руб.`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Срок не указан";
  }

  return new Date(value).toLocaleDateString("ru-RU");
}

function getTaskStatusLabel(status: DashboardSummaryResponse["recent"]["tasks"][number]["status"]) {
  switch (status) {
    case "completed":
      return "Выполнено";
    case "cancelled":
      return "Отменено";
    default:
      return "Активно";
  }
}

function getViolationStatusLabel(status: DashboardSummaryResponse["recent"]["violations"][number]["status"]) {
  return status === "closed" ? "Закрыто" : "Активно";
}

function getTradeTypeLabel(type: DashboardSummaryResponse["recent"]["tradeOperations"][number]["type"]) {
  return type === "sale" ? "Продажа" : "Покупка";
}

function getTaskStatusClass(status: DashboardSummaryResponse["recent"]["tasks"][number]["status"]) {
  switch (status) {
    case "completed":
      return "badge-task-completed";
    case "cancelled":
      return "badge-task-cancelled";
    default:
      return "badge-task-active";
  }
}

function getViolationStatusClass(status: DashboardSummaryResponse["recent"]["violations"][number]["status"]) {
  return status === "closed" ? "badge-task-completed" : "badge-task-active";
}

function getTradeTypeClass(type: DashboardSummaryResponse["recent"]["tradeOperations"][number]["type"]) {
  return type === "sale" ? "badge-task-active" : "badge-neutral";
}

type MetricRow = {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning";
};

type KeyCardProps = {
  title: string;
  value: number | string;
  rows: MetricRow[];
};

function KeyCard({ title, value, rows }: KeyCardProps) {
  return (
    <Panel className="dashboard-key-card animate-panel-in interactive-card">
      <div className="dashboard-card-head">
        <h2>{title}</h2>
      </div>

      <div className="dashboard-key-value">{value}</div>

      <dl className="dashboard-metric-list">
        {rows.map((row) => (
          <div className="dashboard-metric-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd
              className={
                row.tone === "danger"
                  ? "dashboard-metric-danger"
                  : row.tone === "warning"
                    ? "dashboard-metric-warning"
                    : ""
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

type DetailCardProps = {
  title: string;
  rows: MetricRow[];
};

function DetailCard({ title, rows }: DetailCardProps) {
  return (
    <Panel className="dashboard-detail-card animate-panel-in interactive-card">
      <div className="dashboard-card-head">
        <h2>{title}</h2>
      </div>

      <dl className="dashboard-metric-list">
        {rows.map((row) => (
          <div className="dashboard-metric-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd
              className={
                row.tone === "danger"
                  ? "dashboard-metric-danger"
                  : row.tone === "warning"
                    ? "dashboard-metric-warning"
                    : ""
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

type RecentEntryProps = {
  title: string;
  meta: string;
  dateLabel: string;
  badgeLabel: string;
  badgeClassName: string;
  secondaryValue?: string;
};

function RecentEntry({ title, meta, dateLabel, badgeLabel, badgeClassName, secondaryValue }: RecentEntryProps) {
  return (
    <article className="dashboard-recent-entry interactive-card animate-list-item-in">
      <div className="dashboard-recent-entry-top">
        <strong className="dashboard-recent-entry-title">{title}</strong>
        <span className={`badge-chip ${badgeClassName}`}>{badgeLabel}</span>
      </div>

      <p className="dashboard-recent-entry-meta">{meta}</p>

      <div className="dashboard-recent-entry-bottom">
        <span>{dateLabel}</span>
        {secondaryValue ? <strong>{secondaryValue}</strong> : null}
      </div>
    </article>
  );
}

type RecentColumnProps = {
  title: string;
  emptyTitle: string;
  children: ReactNode;
  hasItems: boolean;
};

function RecentColumn({ title, emptyTitle, children, hasItems }: RecentColumnProps) {
  return (
    <div className="dashboard-recent-column">
      <div className="dashboard-card-head">
        <h2>{title}</h2>
      </div>

      {hasItems ? <div className="dashboard-recent-list">{children}</div> : <EmptyState className="mt-3" title={emptyTitle} />}
    </div>
  );
}

export default function Home() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function loadSummary() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const nextSummary = await apiFetchJson<DashboardSummaryResponse>(
          "/api/dashboard/summary",
          undefined,
          "Не удалось загрузить оперативную сводку.",
        );

        if (!isCancelled) {
          setSummary(nextSummary);
        }
      } catch {
        if (!isCancelled) {
          setErrorMessage("Не удалось загрузить оперативную сводку.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      isCancelled = true;
    };
  }, []);

  const primaryStats = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      { code: "ПРФ", label: "Активные профили", value: summary.profiles.active },
      { code: "ГРП", label: "Активные группы", value: summary.groups.active },
      { code: "КВР", label: "Занятые квартиры", value: summary.apartments.occupied },
      { code: "ЗАД", label: "Просроченные задания", value: summary.tasks.overdue },
    ];
  }, [summary]);

  return (
    <main className="pda-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Главная" />

        <div className="pda-content dashboard-page-layout">
          <Panel className="dashboard-top-panel animate-panel-in" tone="accent">
            <PageHeader
              title="Главная панель"
              description="Оперативная сводка внутренней базы группировки «Долг»."
              meta={summary ? `Обновлено: ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : undefined}
            />

            {isLoading ? <p className="draft-message mt-4">Загрузка оперативной сводки...</p> : null}
            {!isLoading && errorMessage ? <p className="draft-message mt-4">{errorMessage}</p> : null}
            {!isLoading && !errorMessage && summary ? (
              <>
                <div className="dashboard-stat-grid mt-4">
                  {primaryStats.map((row) => (
                    <StatCard code={row.code} label={row.label} value={row.value} key={row.code} />
                  ))}
                </div>

                <div className="dashboard-top-copy">
                  <p>Сначала выведены ключевые показатели, ниже расположены детальные карточки состояния и последние записи.</p>
                </div>
              </>
            ) : null}
          </Panel>

          {isLoading ? (
            <Panel className="dashboard-state-panel animate-panel-in">
              <div className="dashboard-card-head">
                <h2>Главная панель</h2>
              </div>
              <div className="dashboard-state-copy">Загрузка оперативной сводки...</div>
            </Panel>
          ) : null}

          {!isLoading && errorMessage ? (
            <Panel className="dashboard-state-panel animate-panel-in">
              <div className="dashboard-card-head">
                <h2>Главная панель</h2>
              </div>
              <div className="dashboard-state-copy">Не удалось загрузить оперативную сводку.</div>
            </Panel>
          ) : null}

          {!isLoading && !errorMessage && summary ? (
            <>
              <section className="dashboard-section">
                <div className="dashboard-section-grid dashboard-section-grid-primary">
                  <KeyCard
                    rows={[
                      { label: "Архив", value: summary.profiles.archive },
                      { label: "Всего", value: summary.profiles.total },
                    ]}
                    title="Профили"
                    value={summary.profiles.active}
                  />
                  <KeyCard
                    rows={[
                      { label: "Архив", value: summary.groups.archive },
                      { label: "Всего", value: summary.groups.total },
                    ]}
                    title="Группы"
                    value={summary.groups.active}
                  />
                  <KeyCard
                    rows={[
                      { label: "Свободно", value: summary.apartments.free },
                      { label: "Просрочено", value: summary.apartments.overduePayments, tone: "danger" },
                      { label: "Истекает", value: summary.apartments.expiringPayments, tone: "warning" },
                    ]}
                    title="Квартиры"
                    value={summary.apartments.occupied}
                  />
                  <KeyCard
                    rows={[
                      { label: "Просроченные", value: summary.tasks.overdue, tone: "danger" },
                      { label: "Выполненные", value: summary.tasks.completed },
                      { label: "Отменённые", value: summary.tasks.cancelled },
                    ]}
                    title="Активные задания"
                    value={summary.tasks.active}
                  />
                </div>
              </section>

              <section className="dashboard-section">
                <div className="dashboard-section-head">
                  <h2>Состояние базы</h2>
                </div>

                <div className="dashboard-section-grid dashboard-section-grid-secondary">
                  <DetailCard
                    rows={[
                      { label: "Активные", value: summary.profiles.active },
                      { label: "Архив", value: summary.profiles.archive },
                      { label: "Всего", value: summary.profiles.total },
                    ]}
                    title="Профили сталкеров"
                  />
                  <DetailCard
                    rows={[
                      { label: "Активные", value: summary.groups.active },
                      { label: "Архив", value: summary.groups.archive },
                      { label: "Всего", value: summary.groups.total },
                    ]}
                    title="Группы сталкеров"
                  />
                  <DetailCard
                    rows={[
                      { label: "Всего", value: summary.apartments.total },
                      { label: "Занято", value: summary.apartments.occupied },
                      { label: "Свободно", value: summary.apartments.free },
                      { label: "Просрочено", value: summary.apartments.overduePayments, tone: "danger" },
                      { label: "Истекает", value: summary.apartments.expiringPayments, tone: "warning" },
                    ]}
                    title="Квартиры и оплата"
                  />
                  <DetailCard
                    rows={[
                      { label: "Активные", value: summary.tasks.active },
                      { label: "Просроченные", value: summary.tasks.overdue, tone: "danger" },
                      { label: "Выполненные", value: summary.tasks.completed },
                      { label: "Отменённые", value: summary.tasks.cancelled },
                    ]}
                    title="Задания"
                  />
                  <DetailCard
                    rows={[
                      { label: "Активные", value: summary.violations.active, tone: "warning" },
                      { label: "Закрытые", value: summary.violations.closed },
                      { label: "Всего", value: summary.violations.total },
                    ]}
                    title="Нарушения"
                  />
                  <DetailCard
                    rows={[
                      { label: "Продаж", value: summary.trade.salesCount },
                      { label: "Покупок", value: summary.trade.purchasesCount },
                      { label: "Сумма продаж", value: formatMoney(summary.trade.salesTotal) },
                      { label: "Сумма покупок", value: formatMoney(summary.trade.purchasesTotal) },
                    ]}
                    title="Торговые операции"
                  />
                </div>
              </section>

              <section className="dashboard-section">
                <Panel className="dashboard-recent-panel animate-panel-in">
                  <div className="dashboard-section-head">
                    <h2>Последние записи</h2>
                  </div>

                  <div className="dashboard-recent-grid">
                    <RecentColumn emptyTitle="Записей пока нет." hasItems={summary.recent.tasks.length > 0} title="Последние задания">
                      {summary.recent.tasks.map((task) => (
                        <RecentEntry
                          badgeClassName={getTaskStatusClass(task.status)}
                          badgeLabel={getTaskStatusLabel(task.status)}
                          dateLabel={`Срок: ${formatDate(task.dueAt)}`}
                          key={task.id}
                          meta={task.assigneeLabel}
                          secondaryValue={formatDate(task.issuedAt)}
                          title={task.description}
                        />
                      ))}
                    </RecentColumn>

                    <RecentColumn
                      emptyTitle="Записей пока нет."
                      hasItems={summary.recent.tradeOperations.length > 0}
                      title="Последние операции"
                    >
                      {summary.recent.tradeOperations.map((operation) => (
                        <RecentEntry
                          badgeClassName={getTradeTypeClass(operation.type)}
                          badgeLabel={getTradeTypeLabel(operation.type)}
                          dateLabel={`Дата: ${formatDate(operation.operationDate)}`}
                          key={operation.id}
                          meta={operation.participantLabel}
                          secondaryValue={formatMoney(operation.totalAmount)}
                          title={operation.participantLabel}
                        />
                      ))}
                    </RecentColumn>

                    <RecentColumn
                      emptyTitle="Записей пока нет."
                      hasItems={summary.recent.violations.length > 0}
                      title="Последние нарушения"
                    >
                      {summary.recent.violations.map((violation) => (
                        <RecentEntry
                          badgeClassName={getViolationStatusClass(violation.status)}
                          badgeLabel={getViolationStatusLabel(violation.status)}
                          dateLabel={`Дата: ${formatDate(violation.date)}`}
                          key={violation.id}
                          meta={violation.violatorLabel}
                          title={violation.description}
                        />
                      ))}
                    </RecentColumn>
                  </div>
                </Panel>
              </section>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
