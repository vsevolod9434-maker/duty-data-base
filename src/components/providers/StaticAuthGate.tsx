"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { stripBasePath } from "@/lib/public-path";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  clearStaticAuthState,
  getStaticAccessProfileResult,
  getStaticAuthGateDecision,
  isCurrentStaticAuthCheck,
  type StaticAuthGateDecision,
} from "@/lib/supabase/static-auth";

const ACCESS_CHECK_TIMEOUT_MS = 12_000;
const RETRY_MESSAGE = "Канал допуска временно не отвечает. Повторите проверку.";

type GateState =
  | { status: "allowed" }
  | { status: "checking" }
  | { status: "retry"; message: string };

type SupabaseAuthUserResult = {
  data: { user: User | null };
  error: unknown;
};

function isMissingSessionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const name =
    error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name).toLowerCase() : "";

  return name.includes("authsessionmissing") || message.includes("auth session missing");
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Access check timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function StaticAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const runIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const hasStaticSupabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const appPathname = stripBasePath(pathname).replace(/\/$/, "") || "/";
  const isLoginPage = appPathname === "/login";
  const configurationError =
    isStaticExport && !hasStaticSupabaseConfig
      ? "Канал служебного допуска не настроен. Обратитесь к дежурному штаба."
      : "";
  const [gateState, setGateState] = useState<GateState>(() => (isStaticExport ? { status: "checking" } : { status: "allowed" }));

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      runIdRef.current += 1;
    };
  }, []);

  const isCurrentRun = useCallback((runId: number) => isCurrentStaticAuthCheck(runId, runIdRef.current, isMountedRef.current), []);

  const applyDecision = useCallback(
    async (decision: StaticAuthGateDecision, runId: number, supabase: ReturnType<typeof createSupabaseBrowserClient>) => {
      if (!isCurrentRun(runId)) return;

      if (decision.action === "allow") {
        setGateState({ status: "allowed" });
        return;
      }

      if (decision.action === "redirect_home") {
        setGateState({ status: "allowed" });
        router.replace("/");
        return;
      }

      if (decision.action === "retry") {
        setGateState({ message: decision.message, status: "retry" });
        return;
      }

      if (decision.clearSession) {
        await clearStaticAuthState(supabase);
      }

      if (!isCurrentRun(runId)) return;

      if (isLoginPage) {
        setGateState({ status: "allowed" });
        return;
      }

      setGateState({ status: "checking" });
      router.replace("/login");
    },
    [isCurrentRun, isLoginPage, router],
  );

  const verifyAccess = useCallback(async () => {
    if (!isStaticExport || configurationError) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setGateState((current) => (current.status === "allowed" ? current : { status: "checking" }));

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;

    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      if (isCurrentRun(runId)) {
        setGateState({ message: RETRY_MESSAGE, status: "retry" });
      }
      return;
    }

    try {
      const {
        data: { user },
        error: authError,
      } = (await withTimeout(supabase.auth.getUser(), ACCESS_CHECK_TIMEOUT_MS)) as SupabaseAuthUserResult;

      if (!isCurrentRun(runId)) return;

      if (authError) {
        if (isMissingSessionError(authError)) {
          await applyDecision(getStaticAuthGateDecision({ status: "unauthenticated" }, isLoginPage), runId, supabase);
          return;
        }

        setGateState({ message: RETRY_MESSAGE, status: "retry" });
        return;
      }

      if (!user) {
        await applyDecision(getStaticAuthGateDecision({ status: "unauthenticated" }, isLoginPage), runId, supabase);
        return;
      }

      const profileResult = await withTimeout(getStaticAccessProfileResult(supabase, user.id), ACCESS_CHECK_TIMEOUT_MS);
      await applyDecision(getStaticAuthGateDecision(profileResult, isLoginPage), runId, supabase);
    } catch {
      if (!isCurrentRun(runId)) return;
      setGateState({ message: RETRY_MESSAGE, status: "retry" });
    }
  }, [applyDecision, configurationError, isCurrentRun, isLoginPage, isStaticExport]);

  useEffect(() => {
    if (!isStaticExport || configurationError) return;

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;

    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      queueMicrotask(() => void verifyAccess());
      return;
    }

    queueMicrotask(() => void verifyAccess());
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT") {
        runIdRef.current += 1;
        if (isLoginPage) {
          setGateState({ status: "allowed" });
        } else {
          setGateState({ status: "checking" });
          router.replace("/login");
        }
        return;
      }

      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void verifyAccess();
      }
    });

    return () => {
      runIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, [configurationError, isLoginPage, isStaticExport, router, verifyAccess]);

  if (configurationError) {
    return (
      <main className="login-page">
        <section className="login-shell">
          <div className="login-card">
            <p className="login-error">{configurationError}</p>
          </div>
        </section>
      </main>
    );
  }

  if (gateState.status === "retry") {
    return (
      <main className="login-page">
        <section className="login-shell">
          <div className="login-card">
            <p className="login-error">{gateState.message}</p>
            <button className="login-submit interactive-button" onClick={() => void verifyAccess()} type="button">
              Повторить проверку
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!isStaticExport || gateState.status === "allowed" || isLoginPage) return children;

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-card">
          <p>Проверка служебного доступа...</p>
        </div>
      </section>
    </main>
  );
}
