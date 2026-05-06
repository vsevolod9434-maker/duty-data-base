"use client";

import { useEffect, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/ui/PdaPatterns";
import { ACTIVITY_LOG_UPDATED_EVENT, readActivityLog } from "@/lib/activity-log";
import { dashboardSummary, journalEntries } from "@/lib/mock-data";
import { getPaginatedItems } from "@/lib/stalker-utils";

const summaryRows = [
  { code: "СТЛ", label: "Сталкеров в базе", value: dashboardSummary.stalkersCount },
  {
    code: "ГРП",
    label: "Активных групп",
    value: dashboardSummary.activeGroupsCount,
  },
  {
    code: "КВР",
    label: "Занятых квартир",
    value: dashboardSummary.occupiedApartmentsCount,
  },
  {
    code: "ЗАД",
    label: "Активных заданий",
    value: dashboardSummary.activeTasksCount,
  },
];

const systemState = [
  { label: "База учёта", value: "Активна" },
  { label: "Служебный доступ", value: "Включён" },
  { label: "Оперативный журнал", value: "Ведётся" },
  { label: "Интерфейс", value: "Готов" },
  { label: "Раздел состава", value: "Временно закрыт", warning: true },
];

const quickOperations = [
  {
    label: "Профили сталкеров",
    description: "Открыть реестр и личные дела сталкеров",
    href: "/stalkers/profiles",
  },
  {
    label: "Группы сталкеров",
    description: "Перейти к составу, ролям и групповым заданиям",
    href: "/stalkers/groups",
  },
  {
    label: "Журналы",
    description: "Оформить задания, продажи, покупки и нарушения",
    href: "/journals",
  },
  {
    label: "Квартиры",
    description: "Проверить жильцов и оплату проживания",
    href: "/apartments",
  },
];

const activityStatusLabels: Record<string, string> = {
  OK: "Норма",
  WAIT: "Ожидание",
  WARN: "Внимание",
};

function getActivityStatusLabel(status: string) {
  return activityStatusLabels[status] ?? status;
}

function getActivityStatusClass(status: string) {
  if (status === "WAIT" || status === "WARN") {
    return "text-[var(--warning)]";
  }

  return "text-[var(--ok)]";
}

function formatActivityTime(createdAt: string | undefined, fallbackTime: string) {
  if (!createdAt) {
    return fallbackTime;
  }

  return new Date(createdAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [journalPage, setJournalPage] = useState(1);
  const [activityEntries, setActivityEntries] = useState(journalEntries);

  useEffect(() => {
    const syncActivityLog = () => {
      setActivityEntries(readActivityLog(journalEntries));
    };

    syncActivityLog();

    window.addEventListener("storage", syncActivityLog);
    window.addEventListener(ACTIVITY_LOG_UPDATED_EVENT, syncActivityLog);

    return () => {
      window.removeEventListener("storage", syncActivityLog);
      window.removeEventListener(ACTIVITY_LOG_UPDATED_EVENT, syncActivityLog);
    };
  }, []);

  const paginatedJournalEntries = getPaginatedItems(activityEntries, journalPage);

  return (
    <main className="pda-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Главная" />

        <div className="pda-content pda-dashboard-grid dashboard-command-grid">
          <Panel className="dashboard-hero-panel lg:row-span-2" id="overview" tone="accent">
            <PageHeader
              eyebrow="Служебная сводка"
              title="Сводка базы"
              description="Оперативная картина по сталкерам, группам, квартирам и текущим заданиям."
              meta="Система учёта"
            />

            <div className="dashboard-stat-grid" id="summary">
              {summaryRows.map((row) => (
                <StatCard code={row.code} label={row.label} value={row.value} key={row.code} />
              ))}
            </div>

            <div className="dashboard-briefing-grid">
              <p>
                Главная панель предназначена для служебного контроля профилей сталкеров, групп, квартир,
                заданий и торговых операций.
              </p>
              <p>
                Все основные разделы доступны допущенному личному составу после входа в систему учёта.
              </p>
            </div>
          </Panel>

          <Panel id="system">
            <div className="panel-heading">
              <h2>Состояние системы</h2>
              <span>Контроль</span>
            </div>

            <dl className="data-table mt-3">
              {systemState.map((item) => (
                <div className="data-row grid-cols-[1fr_auto]" key={item.label}>
                  <dt>{item.label}</dt>
                  <dd className={item.warning ? "text-[var(--warning)]" : ""}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel>
            <div className="panel-heading">
              <h2>Быстрые переходы</h2>
              <span>Команды</span>
            </div>

            <div className="quick-link-grid">
              {quickOperations.map((operation) => (
                <a className="command-row quick-link-row" href={operation.href} key={operation.href}>
                  <strong>{operation.label}</strong>
                  <span>{operation.description}</span>
                </a>
              ))}
            </div>
          </Panel>

          <Panel className="lg:col-span-2">
            <div className="panel-heading">
              <h2>Последние действия</h2>
              <span>Журнал</span>
            </div>

            <div className="data-table mt-3">
              <div className="data-row data-head activity-log-row">
                <span>Дата и время</span>
                <span>Запись</span>
                <span>Статус</span>
              </div>
              {paginatedJournalEntries.items.length > 0 ? (
                paginatedJournalEntries.items.map((entry) => (
                  <div className="data-row activity-log-row" key={entry.id}>
                    <span className="font-mono">{formatActivityTime(entry.createdAt, entry.time)}</span>
                    <span>{entry.title}</span>
                    <span className={getActivityStatusClass(entry.status)}>{getActivityStatusLabel(entry.status)}</span>
                  </div>
                ))
              ) : (
                <EmptyState title="Журнал действий пока пуст." />
              )}
            </div>
            <Pagination
              page={paginatedJournalEntries.page}
              pageCount={paginatedJournalEntries.pageCount}
              onPageChange={setJournalPage}
            />
          </Panel>
        </div>
      </section>
    </main>
  );
}
