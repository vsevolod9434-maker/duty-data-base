import Link from "next/link";
import { PdaTopbar } from "@/components/layout/PdaTopbar";

const navigationCards = [
  {
    description: "Личные дела, записи, архив и привязанные журналы.",
    href: "/stalkers/profiles",
    title: "Профили сталкеров",
  },
  {
    description: "Составы, роли участников и служебные заметки.",
    href: "/stalkers/groups",
    title: "Группы сталкеров",
  },
  {
    description: "Заселение, жильцы и контроль оплаты проживания.",
    href: "/apartments",
    title: "Квартиры",
  },
  {
    description: "Рабочие журналы и служебные записи.",
    href: "/journals",
    title: "Журналы",
  },
  {
    description: "Слои, метки, зоны и маршруты рабочей территории.",
    href: "/map",
    title: "Карта",
  },
];

export default function Home() {
  return (
    <main className="pda-page">
      <section className="pda-screen">
        <PdaTopbar activeLabel="Главная" />

        <div className="pda-content welcome-page">
          <section className="welcome-hero animate-panel-in" aria-labelledby="welcome-title">
            <div className="welcome-hero-frame">
              <div className="welcome-hero-copy">
                <p className="welcome-eyebrow">Внутренняя база учёта</p>
                <h1 id="welcome-title">База данных группировки «Долг»</h1>
                <p className="welcome-status">Служебный доступ подтверждён</p>
                <p className="welcome-text">
                  Добро пожаловать в систему учёта. Доступ к разделам открыт в соответствии с текущим служебным допуском.
                </p>
              </div>

              <nav className="welcome-nav" aria-label="Основные разделы">
                {navigationCards.map((card) => (
                  <Link className="welcome-nav-card interactive-card" href={card.href} key={card.href}>
                    <span>{card.title}</span>
                    <small>{card.description}</small>
                  </Link>
                ))}
              </nav>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
