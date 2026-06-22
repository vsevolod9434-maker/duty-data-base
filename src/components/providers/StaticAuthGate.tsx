"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { stripBasePath } from "@/lib/public-path";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function StaticAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const appPathname = stripBasePath(pathname).replace(/\/$/, "") || "/";
  const isLoginPage = appPathname === "/login";
  const [isAllowed, setIsAllowed] = useState(!isStaticExport);

  useEffect(() => {
    if (!isStaticExport) return;

    let isCancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function verifyAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      let hasAccess = false;

      if (user) {
        const { data: accessUser } = await supabase
          .from("AccessUser")
          .select("isActive")
          .eq("authUserId", user.id)
          .maybeSingle();
        hasAccess = accessUser?.isActive === true;
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
    }

    void verifyAccess();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void verifyAccess();
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, [isLoginPage, isStaticExport, router]);

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
