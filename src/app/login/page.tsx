"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signInStaticAccessUser } from "@/lib/supabase/static-auth";

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

const loginErrorMessage = "Доступ не подтверждён. Проверьте логин и пароль.";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedLogin = login.trim();

    if (!normalizedLogin) {
      setMessage("Введите логин.");
      return;
    }

    if (!password) {
      setMessage("Введите пароль.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      if (process.env.NEXT_PUBLIC_STATIC_EXPORT === "true") {
        const supabase = createSupabaseBrowserClient();
        await signInStaticAccessUser(supabase, normalizedLogin, password);

        router.replace("/");
        router.refresh();
        return;
      }

      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({ login: normalizedLogin, password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !payload?.ok) {
        setMessage(loginErrorMessage);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setMessage(loginErrorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-page-grid" aria-hidden="true" />
      <section className="login-shell">
        <aside className="login-briefing animate-panel-in" aria-label="Сводка допуска">
          <div className="login-briefing-topline">
            <span className="login-status-dot" />
            <span>Пост допуска</span>
          </div>
          <div className="login-briefing-copy">
            <span className="login-kicker">Внутренняя база группировки «Долг»</span>
            <h1>Служебный реестр</h1>
            <p>Вход открыт только личному составу с подтверждённым допуском.</p>
          </div>
          <dl className="login-status-list">
            <div>
              <dt>Контур</dt>
              <dd>Учёт состава и операций</dd>
            </div>
            <div>
              <dt>Режим</dt>
              <dd>Закрытый доступ</dd>
            </div>
          </dl>
        </aside>

        <div className="login-card animate-panel-in" aria-labelledby="login-title">
          <div className="login-card-header">
            <span className="login-kicker">Авторизация</span>
            <h2 id="login-title">Вход в реестр</h2>
            <p>Введите данные допуска, выданные штабом.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              <span>Логин</span>
              <input
                autoComplete="username"
                disabled={isLoading}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Введите логин"
                type="text"
                value={login}
              />
            </label>

            <label>
              <span>Пароль</span>
              <input
                autoComplete="current-password"
                disabled={isLoading}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль"
                type="password"
                value={password}
              />
            </label>

            {message ? <p className="login-error">{message}</p> : null}

            <button className="login-submit interactive-button" disabled={isLoading} type="submit">
              {isLoading ? "Проверка допуска…" : "Войти"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
