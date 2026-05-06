"use client";

import { PdaTopbar } from "@/components/layout/PdaTopbar";

const blockedMessage = "Функционал временно недоступен. Обратитесь к системному администратору.";

export default function DutyMembersPage() {
  return (
    <main className="pda-page duty-members-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Состав" />

        <div className="pda-content">
          <section className="section-panel">
            <div className="empty-state profile-detail-empty">
              <p>{blockedMessage}</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
