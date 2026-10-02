"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUserQuery, useDutyQueryClient } from "@/lib/data-cache";
import { navigation } from "@/lib/navigation";
import { stripBasePath, withBasePath } from "@/lib/public-path";
import { getTodayDate } from "@/lib/stalker-utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AccessUserResponse = {
  login?: string | null;
  displayName?: string | null;
};

function getPathWithoutQuery(href: string) {
  return href.split("?")[0] || "/";
}

type PdaTopbarProps = {
  activeLabel: string;
  activeSubtab?: string;
  activeSubtabLabel?: string;
  onSubtabChange?: (label: string) => void;
};

export function PdaTopbar({ activeLabel, activeSubtab, activeSubtabLabel, onSubtabChange }: PdaTopbarProps) {
  const rawPathname = usePathname();
  const pathname = stripBasePath(rawPathname).replace(/\/$/, "") || "/";
  const router = useRouter();
  const queryClient = useDutyQueryClient();
  const currentUserQuery = useCurrentUserQuery();
  const navMenuRef = useRef<HTMLElement | null>(null);
  const dropdownCloseTimerRef = useRef<number | null>(null);
  const [moscowTime, setMoscowTime] = useState<string | null>(null);
  const [systemDate, setSystemDate] = useState<string | null>(null);
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const lastPointerTypeRef = useRef<string>("mouse");
  const user = currentUserQuery.data as AccessUserResponse | undefined;
  const userLabel = user?.displayName || user?.login || "";

  function cancelDropdownClose() {
    if (dropdownCloseTimerRef.current !== null) {
      window.clearTimeout(dropdownCloseTimerRef.current);
      dropdownCloseTimerRef.current = null;
    }
  }

  function openDropdown(label: string) {
    cancelDropdownClose();
    setOpenDropdownLabel(label);
  }

  function scheduleDropdownClose() {
    cancelDropdownClose();
    dropdownCloseTimerRef.current = window.setTimeout(() => {
      setOpenDropdownLabel(null);
      dropdownCloseTimerRef.current = null;
    }, 220);
  }

  const tabFromPath =
    navigation.find(
      (tab) => tab.href === pathname || tab.subtabs.some((subtab) => getPathWithoutQuery(subtab.href) === pathname),
    ) ?? navigation[0];
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
      setSystemDate(getTodayDate().split("-").reverse().join("."));
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
    const updateOnlineState = () => setIsOnline(navigator.onLine);

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);

    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dropdownCloseTimerRef.current !== null) {
        window.clearTimeout(dropdownCloseTimerRef.current);
      }
    };
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

  const sectionPath = [activeTab.label, activeTab.subtabs.length > 0 ? currentSubtabLabel : null].filter(Boolean).join(" / ");

  return (
    <>
      <header className="pda-topbar registry-topbar">
        <div className="pda-shell-header registry-shell-header">
          <div className="pda-brand registry-brand">
            <span className="pda-brand-mark registry-brand-mark">
              <Image alt="Эмблема группировки «Долг»" height={42} priority src={withBasePath("/duty-logo.png")} width={42} />
            </span>
            <div className="pda-brand-copy registry-brand-copy">
              <strong>База данных «Долг»</strong>
            </div>
          </div>

          <nav className="pda-main-nav registry-main-nav" aria-label="Основные разделы" ref={navMenuRef}>
            {navigation.map((tab) => {
              const isActive = tab.label === activeTab.label;
              const hasDropdown = tab.subtabs.length > 0;
              const isDropdownOpen = openDropdownLabel === tab.label;

              if (hasDropdown) {
                return (
                  <div
                    className="pda-nav-dropdown"
                    key={tab.label}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") {
                        openDropdown(tab.label);
                      }
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === "mouse") {
                        scheduleDropdownClose();
                      }
                    }}
                  >
                    <button
                      aria-current={isActive ? "page" : undefined}
                      aria-expanded={isDropdownOpen}
                      className={`pda-tab registry-nav-tab pda-nav-dropdown-trigger ${isActive ? "pda-tab-active registry-nav-tab-active" : ""}`}
                      onClick={() => {
                        cancelDropdownClose();

                        if (lastPointerTypeRef.current !== "mouse") {
                          setOpenDropdownLabel(isDropdownOpen ? null : tab.label);
                          return;
                        }

                        setOpenDropdownLabel(null);
                        router.push(tab.href);
                      }}
                      onFocus={(event) => {
                        if (event.currentTarget.matches(":focus-visible")) {
                          openDropdown(tab.label);
                        }
                      }}
                      onKeyDown={(event) => {
                        lastPointerTypeRef.current = "mouse";

                        if (event.key === "ArrowDown") {
                          const dropdownElement = event.currentTarget.parentElement;

                          event.preventDefault();
                          openDropdown(tab.label);
                          window.requestAnimationFrame(() => {
                            dropdownElement?.querySelector<HTMLElement>(".pda-nav-dropdown-option")?.focus();
                          });
                        }
                      }}
                      onPointerDown={(event) => {
                        lastPointerTypeRef.current = event.pointerType || "mouse";
                      }}
                      title={`${tab.label}: открыть раздел`}
                      type="button"
                    >
                      <span>{tab.label}</span>
                      <span className="pda-nav-dropdown-caret" aria-hidden="true">
                        ▾
                      </span>
                    </button>
                    {isDropdownOpen ? (
                      <div className="pda-nav-dropdown-menu" onMouseEnter={cancelDropdownClose} role="menu">
                        {tab.subtabs.map((subtab) => {
                          const isSubtabActive = isActive && (subtab.label === currentSubtabLabel || subtab.href === pathname);

                          return (
                            <a
                              aria-current={isSubtabActive ? "page" : undefined}
                              className={`pda-nav-dropdown-option ${isSubtabActive ? "pda-nav-dropdown-option-active" : ""}`}
                              href={withBasePath(subtab.href)}
                              key={subtab.label}
                              onClick={(event) => {
                                if (isActive && onSubtabChange) {
                                  event.preventDefault();
                                  onSubtabChange(subtab.label);
                                }
                                setOpenDropdownLabel(null);
                              }}
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
                  href={withBasePath(tab.href)}
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
              {isSigningOut ? "Выход…" : "Выйти"}
            </button>
            <span className="pda-clock" title="Время по Москве">
              {moscowTime ?? "--:--"}
            </span>
          </div>
        </div>
      </header>
      <footer className="pda-statusbar" aria-label="Строка состояния">
        <span className="pda-statusbar-device">КПК «Долг-09»</span>
        <span className="pda-statusbar-path">{sectionPath}</span>
        <span className="pda-statusbar-spacer" />
        <span className="pda-statusbar-item">Сист. дата {systemDate ?? "--.--.----"}</span>
        <span className={`pda-statusbar-item pda-statusbar-link ${isOnline ? "" : "pda-statusbar-link-offline"}`} role="status">
          <span aria-hidden="true" className={`pda-signal ${isOnline ? "pda-signal-online" : "pda-signal-offline"}`} />
          {isOnline ? "Связь есть" : "Нет связи"}
        </span>
        <span className="pda-statusbar-item pda-statusbar-hint">
          <kbd>Esc</kbd> закрыть окно
        </span>
      </footer>
    </>
  );
}
