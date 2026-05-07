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

type SummaryMetric = {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning";
};

type SummarySectionProps = {
  title: string;
  caption: string;
  overviewLabel: string;
  metrics: SummaryMetric[];
};

function SummarySection({ title, caption, overviewLabel, metrics }: SummarySectionProps) {
  const [primaryMetric, ...secondaryMetrics] = metrics;

  return (
    <Panel className="dashboard-summary-panel animate-panel-in interactive-card">
      <div className="dashboard-summary-header">
        <div>
          <p className="dashboard-summary-caption">{caption}</p>
          <h2>{title}</h2>
        </div>
        <span className="dashboard-summary-chip">{overviewLabel}</span>
      </div>

      <div className="dashboard-summary-overview">
        <span>{primaryMetric.label}</span>
        <strong
          className={
            primaryMetric.tone === "danger"
              ? "dashboard-summary-value dashboard-summary-value-danger"
              : primaryMetric.tone === "warning"
                ? "dashboard-summary-value dashboard-summary-value-warning"
                : "dashboard-summary-value"
          }
        >
          {primaryMetric.value}
        </strong>
      </div>

      <dl className="dashboard-summary-metrics">
        {secondaryMetrics.map((metric) => (
          <div className="dashboard-summary-metric" key={metric.label}>
            <dt>{metric.label}</dt>
            <dd
              className={
                metric.tone === "danger"
                  ? "dashboard-summary-value-danger"
                  : metric.tone === "warning"
                    ? "dashboard-summary-value-warning"
                    : ""
              }
            >
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

type RecentPanelProps = {
  title: string;
  caption: string;
  emptyTitle: string;
  children: ReactNode;
  hasItems: boolean;
};

function RecentPanel({ title, caption, emptyTitle, children, hasItems }: RecentPanelProps) {
  return (
    <Panel className="dashboard-recent-panel animate-panel-in">
      <div className="dashboard-summary-header">
        <div>
          <p className="dashboard-summary-caption">{caption}</p>
          <h2>{title}</h2>
        </div>
        <span className="dashboard-summary-chip">Лента</span>
      </div>

      {hasItems ? <div className="dashboard-recent-list">{children}</div> : <EmptyState className="mt-3" title={emptyTitle} />}
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

function DashboardState({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "error" }) {
  return (
    <Panel className="dashboard-state-panel animate-panel-in" tone={tone === "error" ? "muted" : "default"}>
      <div className="panel-heading">
        <h2>Состояние панели</h2>
        <span>{tone === "error" ? "Сбой загрузки" : "Подготовка сводки"}</span>
      </div>

      <div className="dashboard-state-copy">{children}</div>
    </Panel>
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
      { code: "СРОК", label: "Просроченные задания", value: summary.tasks.overdue },
    ];
  }, [summary]);

  return (
    <main className="pda-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Главная" />

        <div className="pda-content pda-dashboard-grid dashboard-command-grid">
          <Panel className="dashboard-hero-panel lg:row-span-2 animate-panel-in" id="overview" tone="accent">
            <PageHeader
              eyebrow="Оперативная сводка"
              title="Главная панель"
              description="Оперативная сводка внутренней базы группировки «Долг»."
              meta={summary ? `Обновлено: ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : undefined}
            />

            {isLoading ? <p className="draft-message mt-4">Загрузка оперативной сводки...</p> : null}
            {!isLoading && errorMessage ? <p className="draft-message mt-4">{errorMessage}</p> : null}
            {!isLoading && !errorMessage && summary ? (
              <>
                <div className="dashboard-stat-grid mt-4" id="summary">
                  {primaryStats.map((row) => (
                    <StatCard code={row.code} label={row.label} value={row.value} key={row.code} />
                  ))}
                </div>

                <div className="dashboard-briefing-grid mt-4">
                  <p>
                    Под контролем находятся профили, группы, квартиры, задания, нарушения и торговые операции. Панель показывает только служебную сводку без полной загрузки реестров.
                  </p>
                  <p>
                    Отдельные разделы открывайте по рабочей необходимости. Последние записи ниже помогают быстро оценить текущую обстановку.
                  </p>
                </div>
              </>
            ) : null}
          </Panel>

          {isLoading ? (
            <DashboardState>
              <p>Загрузка оперативной сводки...</p>
            </DashboardState>
          ) : null}

          {!isLoading && errorMessage ? (
            <DashboardState tone="error">
              <p>Не удалось загрузить оперативную сводку.</p>
            </DashboardState>
          ) : null}

          {!isLoading && !errorMessage && summary ? (
            <>
              <SummarySection
                caption="Личный состав"
                overviewLabel="Реестр"
                metrics={[
                  { label: "Активные", value: summary.profiles.active },
                  { label: "Архив", value: summary.profiles.archive },
                  { label: "Всего", value: summary.profiles.total },
                ]}
                title="Профили сталкеров"
              />

              <SummarySection
                caption="Подразделения"
                overviewLabel="Состав"
                metrics={[
                  { label: "Активные", value: summary.groups.active },
                  { label: "Архив", value: summary.groups.archive },
                  { label: "Всего", value: summary.groups.total },
                ]}
                title="Группы"
              />

              <SummarySection
                caption="Проживание"
                overviewLabel="Жильё"
                metrics={[
                  { label: "Всего", value: summary.apartments.total },
                  { label: "Занято", value: summary.apartments.occupied },
                  { label: "Свободно", value: summary.apartments.free },
                  { label: "Просрочено оплат", value: summary.apartments.overduePayments, tone: "danger" },
                  { label: "Истекает оплат", value: summary.apartments.expiringPayments, tone: "warning" },
                ]}
                title="Квартиры"
              />

              <SummarySection
                caption="Исполнение"
                overviewLabel="Контроль"
                metrics={[
                  { label: "Активные", value: summary.tasks.active },
                  { label: "Просроченные", value: summary.tasks.overdue, tone: "danger" },
                  { label: "Выполненные", value: summary.tasks.completed },
                  { label: "Отменённые", value: summary.tasks.cancelled },
                ]}
                title="Задания"
              />

              <SummarySection
                caption="Дисциплина"
                overviewLabel="Надзор"
                metrics={[
                  { label: "Активные", value: summary.violations.active, tone: "warning" },
                  { label: "Закрытые", value: summary.violations.closed },
                  { label: "Всего", value: summary.violations.total },
                ]}
                title="Нарушения"
              />

              <SummarySection
                caption="Оборот"
                overviewLabel="Учёт"
                metrics={[
                  { label: "Продаж", value: summary.trade.salesCount },
                  { label: "Покупок", value: summary.trade.purchasesCount },
                  { label: "Сумма продаж", value: formatMoney(summary.trade.salesTotal) },
                  { label: "Сумма покупок", value: formatMoney(summary.trade.purchasesTotal) },
                ]}
                title="Торговые операции"
              />

              <Panel className="animate-panel-in lg:col-span-2 xl:col-span-3">
                <div className="panel-heading">
                  <h2>Последние записи</h2>
                  <span>Оперативная лента</span>
                </div>

                <div className="dashboard-recent-grid">
                  <RecentPanel caption="Последние 5" emptyTitle="Записей пока нет." hasItems={summary.recent.tasks.length > 0} title="Последние задания">
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
                  </RecentPanel>

                  <RecentPanel
                    caption="Последние 5"
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
                  </RecentPanel>

                  <RecentPanel
                    caption="Последние 5"
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
                  </RecentPanel>
                </div>
              </Panel>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
