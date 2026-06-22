"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeLogin } from "@/lib/auth-login";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

async function createTechnicalAuthEmail(login: string) {
  const bytes = new TextEncoder().encode(normalizeLogin(login));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `u-${hash.slice(0, 40)}@duty.local`;
}

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
        const email = await createTechnicalAuthEmail(normalizedLogin);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data.user) {
          setMessage("Не удалось выполнить вход. Проверьте логин и пароль.");
          return;
        }

        const { data: accessUser, error: accessError } = await supabase
          .from("AccessUser")
          .select("authUserId, isActive")
          .eq("authUserId", data.user.id)
          .maybeSingle();

        if (accessError || !accessUser?.isActive) {
          await supabase.auth.signOut();
          setMessage("Доступ к системе запрещён.");
          return;
        }

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
