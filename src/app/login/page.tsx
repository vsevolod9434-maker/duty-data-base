"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signInStaticAccessUser, staticLoginErrorMessage } from "@/lib/supabase/static-auth";

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
      setMessage("Введите логин или служебный идентификатор.");
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
        setMessage(payload?.error || staticLoginErrorMessage);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : staticLoginErrorMessage);
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
              <span>Логин или служебный идентификатор</span>
              <input
                autoComplete="username"
                disabled={isLoading}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Введите логин или служебный идентификатор"
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
