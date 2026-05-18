"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUserQuery, useDutyQueryClient } from "@/lib/data-cache";
import { navigation } from "@/lib/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AccessUserResponse = {
  login?: string | null;
  displayName?: string | null;
};

type PdaTopbarProps = {
  activeLabel: string;
  activeSubtab?: string;
  activeSubtabLabel?: string;
  onSubtabChange?: (label: string) => void;
};

export function PdaTopbar({ activeLabel, activeSubtab, activeSubtabLabel }: PdaTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useDutyQueryClient();
  const currentUserQuery = useCurrentUserQuery();
  const navMenuRef = useRef<HTMLElement | null>(null);
  const [moscowTime, setMoscowTime] = useState<string | null>(null);
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const user = currentUserQuery.data as AccessUserResponse | undefined;
  const userLabel = user?.displayName || user?.login || "";

  const tabFromPath =
    navigation.find((tab) => tab.href === pathname || tab.subtabs.some((subtab) => subtab.href === pathname)) ??
    navigation[0];
  const activeTab = navigation.find((tab) => tab.label === activeLabel) ?? tabFromPath;
  const currentSubtabLabel =
    activeSubtabLabel ??
    activeSubtab ??
    activeTab.subtabs.find((subtab) => subtab.href === pathname)?.label ??
    null;

  useEffect(() => {
    if (!currentUserQuery.error) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    queryClient.clear();
    void supabase.auth.signOut().finally(() => {
      router.replace("/login");
      router.refresh();
    });
  }, [currentUserQuery.error, queryClient, router]);

  async function signOut() {
    setIsSigningOut(true);

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    }
  }

  useEffect(() => {
    const updateTime = () => {
      setMoscowTime(
        new Intl.DateTimeFormat("ru-RU", {
          timeZone: "Europe/Moscow",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };

    updateTime();
    const intervalHandle = window.setInterval(updateTime, 30_000);

    return () => window.clearInterval(intervalHandle);
  }, []);

  useEffect(() => {
    if (!openDropdownLabel) {
      return;
    }

    const closeOnOutsideAction = (event: MouseEvent | FocusEvent) => {
      if (!navMenuRef.current?.contains(event.target as Node)) {
        setOpenDropdownLabel(null);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDropdownLabel(null);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideAction);
    document.addEventListener("focusin", closeOnOutsideAction);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideAction);
      document.removeEventListener("focusin", closeOnOutsideAction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openDropdownLabel]);

  return (
    <header className="pda-topbar registry-topbar">
      <div className="pda-shell-header registry-shell-header">
        <div className="pda-brand registry-brand">
          <span className="pda-brand-mark registry-brand-mark">
            <Image alt="Эмблема группировки «Долг»" height={42} priority src="/duty-logo.png" width={42} />
          </span>
          <div className="pda-brand-copy registry-brand-copy">
            <strong>База данных «Долг»</strong>
          </div>
        </div>

        <nav className="pda-main-nav registry-main-nav" aria-label="Основные разделы" ref={navMenuRef}>
          {navigation.map((tab) => {
            const isActive = tab.label === activeTab.label;
            const hasDropdown = tab.subtabs.some((subtab) => subtab.href.startsWith("/"));
            const isDropdownOpen = openDropdownLabel === tab.label;

            if (hasDropdown) {
              return (
                <div className="pda-nav-dropdown" key={tab.label} onMouseEnter={() => setOpenDropdownLabel(tab.label)}>
                  <button
                    aria-current={isActive ? "page" : undefined}
                    aria-expanded={isDropdownOpen}
                    className={`pda-tab registry-nav-tab pda-nav-dropdown-trigger ${isActive ? "pda-tab-active registry-nav-tab-active" : ""}`}
                    onClick={() => setOpenDropdownLabel((currentLabel) => (currentLabel === tab.label ? null : tab.label))}
                    onFocus={() => setOpenDropdownLabel(tab.label)}
                    type="button"
                  >
                    <span>{tab.label}</span>
                    <span className="pda-nav-dropdown-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {isDropdownOpen ? (
                    <div className="pda-nav-dropdown-menu" role="menu">
                      {tab.subtabs.map((subtab) => {
                        const isSubtabActive = subtab.label === currentSubtabLabel || subtab.href === pathname;

                        return (
                          <a
                            aria-current={isSubtabActive ? "page" : undefined}
                            className={`pda-nav-dropdown-option ${isSubtabActive ? "pda-nav-dropdown-option-active" : ""}`}
                            href={subtab.href}
                            key={subtab.label}
                            onClick={() => setOpenDropdownLabel(null)}
                            role="menuitem"
                          >
                            {subtab.label}
                          </a>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <a
                aria-current={isActive ? "page" : undefined}
                className={`pda-tab registry-nav-tab ${isActive ? "pda-tab-active registry-nav-tab-active" : ""}`}
                href={tab.href}
                key={tab.label}
              >
                {tab.label}
              </a>
            );
          })}
        </nav>

        <div className="pda-status registry-status">
          {userLabel ? (
            <span className="pda-user-email" title={userLabel}>
              {userLabel}
            </span>
          ) : null}
          <button className="pda-signout-button" disabled={isSigningOut} onClick={signOut} type="button">
            {isSigningOut ? "Выход..." : "Выйти"}
          </button>
          <span className="pda-clock">{moscowTime ?? "--:--"}</span>
          <span className="pda-signal" aria-hidden="true" />
          <span className="battery" aria-label="Батарея" />
        </div>
      </div>
    </header>
  );
}
