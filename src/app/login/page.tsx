"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("Введите email.");
      return;
    }

    if (!password) {
      setMessage("Введите пароль.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setMessage("Не удалось выполнить вход. Проверьте данные.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setMessage("Не удалось выполнить вход. Проверьте данные.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-card">
          <div className="login-card-header">
            <span className="login-kicker">Duty RP Control System</span>
            <h1>Вход в систему учёта</h1>
            <p>Доступ только для допущенного личного состава.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                disabled={isLoading}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                type="email"
                value={email}
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

            <button className="login-submit" disabled={isLoading} type="submit">
              {isLoading ? "Проверка доступа..." : "Войти"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
