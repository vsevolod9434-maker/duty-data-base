import { DutyDashboard } from "@/components/dashboard/DutyDashboard";
import { PdaTopbar } from "@/components/layout/PdaTopbar";

export default function Home() {
  return (
    <main className="pda-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Главная" />

        <div className="pda-content dashboard-page">
          <header className="dashboard-header">
            <h1>Сводка дежурного</h1>
            <p>Оперативное состояние учёта группировки «Долг»</p>
          </header>
          <DutyDashboard />
        </div>
      </section>
    </main>
  );
}
