"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { stripBasePath } from "@/lib/public-path";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearStaticAuthState, getStaticAccessUserProfile } from "@/lib/supabase/static-auth";

export function StaticAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const hasStaticSupabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const appPathname = stripBasePath(pathname).replace(/\/$/, "") || "/";
  const isLoginPage = appPathname === "/login";
  const [isAllowed, setIsAllowed] = useState(!isStaticExport);
  const configurationError =
    isStaticExport && !hasStaticSupabaseConfig
      ? "Публичные переменные Supabase не настроены. Проверьте GitHub Actions Secrets для статической публикации."
      : "";

  useEffect(() => {
    if (!isStaticExport || configurationError) return;

    let isCancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function verifyAccess() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        let hasAccess = false;

        if (user) {
          const accessUser = await getStaticAccessUserProfile(supabase, user.id);
          hasAccess = accessUser?.isActive === true;

          if (!hasAccess) {
            await clearStaticAuthState(supabase);
          }
        }

        if (isCancelled) return;

        if (hasAccess && isLoginPage) {
          router.replace("/");
        } else if (!hasAccess && !isLoginPage) {
          setIsAllowed(false);
          router.replace("/login");
        } else {
          setIsAllowed(true);
        }
      } catch {
        if (isCancelled) return;
        setIsAllowed(isLoginPage);
        if (!isLoginPage) {
          router.replace("/login");
        }
      }
    }

    void verifyAccess();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void verifyAccess();
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, [configurationError, isLoginPage, isStaticExport, router]);

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

  if (!isStaticExport || isAllowed || isLoginPage) return children;

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
