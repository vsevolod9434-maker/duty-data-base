"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

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
      const response = await fetch("/api/auth/login", {
        body: JSON.stringify({ login: normalizedLogin, password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.error || "Не удалось выполнить вход. Проверьте логин и пароль.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setMessage("Не удалось выполнить вход. Проверьте логин и пароль.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-card animate-panel-in">
          <div className="login-card-header">
            <span className="login-kicker">Внутренняя база группировки «Долг»</span>
            <h1>Вход в систему учёта</h1>
            <p>Доступ разрешён только допущенному личному составу.</p>
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
              {isLoading ? "Проверка доступа..." : "Войти"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
