"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { navigation } from "@/lib/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AccessUserResponse = {
  login?: string | null;
  displayName?: string | null;
  roleLabel?: string | null;
  email?: string | null;
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
  const stalkersMenuRef = useRef<HTMLDivElement | null>(null);
  const [moscowTime, setMoscowTime] = useState<string | null>(null);
  const [isStalkersMenuOpen, setIsStalkersMenuOpen] = useState(false);
  const [isDutyBlockedModalOpen, setIsDutyBlockedModalOpen] = useState(false);
  const [userLabel, setUserLabel] = useState("");
  const [userRoleLabel, setUserRoleLabel] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);

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
    let isCancelled = false;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me");

        if (!response.ok) {
          return;
        }

        const user = (await response.json()) as AccessUserResponse;

        if (!isCancelled) {
          setUserLabel(user.displayName || user.login || user.email || "");
          setUserRoleLabel(user.roleLabel || "");
        }
      } catch {
        if (!isCancelled) {
          setUserLabel("");
          setUserRoleLabel("");
        }
      }
    }

    void loadUser();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function signOut() {
    setIsSigningOut(true);

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
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
    if (!isStalkersMenuOpen) {
      return;
    }

    const closeOnOutsideAction = (event: MouseEvent | FocusEvent) => {
      if (!stalkersMenuRef.current?.contains(event.target as Node)) {
        setIsStalkersMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsStalkersMenuOpen(false);
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
  }, [isStalkersMenuOpen]);

  return (
    <header className="pda-topbar registry-topbar">
      <div className="pda-shell-header registry-shell-header">
        <div className="pda-brand registry-brand">
          <span className="pda-brand-mark registry-brand-mark">
            <Image alt="Эмблема Долга" height={42} priority src="/duty-logo.png" width={42} />
          </span>
          <div className="pda-brand-copy registry-brand-copy">
            <strong>ВСГ «Долг»</strong>
          </div>
        </div>

        <nav className="pda-main-nav registry-main-nav" aria-label="Основные разделы">
          {navigation.map((tab) => {
            const isActive = tab.label === activeTab.label;
            const hasStalkersDropdown = tab.href === "/stalkers/profiles" && tab.subtabs.length > 0;

            if (hasStalkersDropdown) {
              return (
                <div className="pda-nav-dropdown" key={tab.label} ref={stalkersMenuRef}>
                  <button
                    aria-current={isActive ? "page" : undefined}
                    aria-expanded={isStalkersMenuOpen}
                    className={`pda-tab registry-nav-tab pda-nav-dropdown-trigger ${isActive ? "pda-tab-active registry-nav-tab-active" : ""}`}
                    onClick={() => setIsStalkersMenuOpen((isOpen) => !isOpen)}
                    type="button"
                  >
                    <span>{tab.label}</span>
                    <span className="pda-nav-dropdown-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {isStalkersMenuOpen ? (
                    <div className="pda-nav-dropdown-menu" role="menu">
                      {tab.subtabs.map((subtab) => {
                        const isSubtabActive = subtab.label === currentSubtabLabel || subtab.href === pathname;

                        return (
                          <a
                            aria-current={isSubtabActive ? "page" : undefined}
                            className={`pda-nav-dropdown-option ${isSubtabActive ? "pda-nav-dropdown-option-active" : ""}`}
                            href={subtab.href}
                            key={subtab.label}
                            onClick={() => setIsStalkersMenuOpen(false)}
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

            if (tab.href === "/duty-members") {
              return (
                <button
                  aria-current={isActive ? "page" : undefined}
                  className={`pda-tab registry-nav-tab ${isActive ? "pda-tab-active registry-nav-tab-active" : ""}`}
                  key={tab.label}
                  onClick={() => setIsDutyBlockedModalOpen(true)}
                  type="button"
                >
                  {tab.label}
                </button>
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
            <span className="pda-user-email" title={userRoleLabel ? `${userLabel} — ${userRoleLabel}` : userLabel}>
              {userLabel}
              {userRoleLabel ? <small>{userRoleLabel}</small> : null}
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
      {isDutyBlockedModalOpen ? (
        <div className="pda-modal-backdrop">
          <div className="pda-modal task-modal">
            <div className="section-header modal-header">
              <div className="min-w-0">
                <h1>Состав</h1>
                <p>Функционал временно недоступен. Обратитесь к системному администратору.</p>
              </div>
            </div>
            <div className="modal-actions">
              <button className="primary-command" onClick={() => setIsDutyBlockedModalOpen(false)} type="button">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
