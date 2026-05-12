import { PdaTopbar } from "@/components/layout/PdaTopbar";

export default function Home() {
  return (
    <main className="pda-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Главная" />

        <div className="pda-content welcome-page">
          <section className="welcome-screen animate-panel-in" aria-labelledby="welcome-title">
            <div className="welcome-screen-layer welcome-screen-layer-grid" aria-hidden="true" />

            <div className="welcome-shell">
              <div className="welcome-panel">
                <div className="welcome-panel-head">
                  <span className="welcome-indicator" aria-hidden="true" />
                  <p className="welcome-eyebrow">Внутренняя база учёта</p>
                </div>

                <div className="welcome-content">
                  <div className="welcome-copy-rail" aria-hidden="true" />

                  <div className="welcome-hero-copy">
                    <h1 id="welcome-title">База данных группировки «Долг»</h1>
                    <p className="welcome-status">Служебный доступ подтверждён</p>
                    <p className="welcome-text">
                      Добро пожаловать в систему учёта. Доступ к разделам открыт в соответствии с текущим служебным допуском.
                    </p>
                  </div>

                  <div className="welcome-service-panel" aria-hidden="true">
                    <div className="welcome-service-panel-head">
                      <span className="welcome-indicator" />
                      <strong>Служебный режим</strong>
                    </div>
                    <div className="welcome-service-list">
                      <span>Учёт ведётся в штатном порядке</span>
                      <span>Разделы открыты согласно допуску</span>
                      <span>Данные доступны для работы</span>
                    </div>
                  </div>
                </div>

                <div className="welcome-status-strip" aria-hidden="true">
                  <span>Система учёта активна</span>
                  <span>Доступ разрешён</span>
                  <span>Группировка «Долг»</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
