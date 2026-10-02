"use client";

import { useEffect, useRef, useState } from "react";
import { UI_NOTICE_EVENT, type UiNoticeDetail } from "@/lib/ui-notice";

type NoticeItem = UiNoticeDetail & {
  id: number;
  time: string;
};

const NOTICE_LIFETIME_MS = 5_000;
const MAX_VISIBLE_NOTICES = 3;
const toneLabels: Record<UiNoticeDetail["tone"], string> = {
  ok: "Выполнено",
  warn: "Выполнено",
  error: "Ошибка",
};

export function PdaNoticeTray() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const nextIdRef = useRef(1);

  useEffect(() => {
    const timers = new Set<number>();

    const handleNotice = (event: Event) => {
      const detail = (event as CustomEvent<UiNoticeDetail>).detail;

      if (!detail?.message) {
        return;
      }

      const id = nextIdRef.current;
      nextIdRef.current += 1;

      setNotices((currentNotices) =>
        [
          ...currentNotices,
          {
            ...detail,
            id,
            time: new Intl.DateTimeFormat("ru-RU", {
              timeZone: "Europe/Moscow",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(new Date()),
          },
        ].slice(-MAX_VISIBLE_NOTICES),
      );

      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setNotices((currentNotices) => currentNotices.filter((notice) => notice.id !== id));
      }, NOTICE_LIFETIME_MS);
      timers.add(timer);
    };

    window.addEventListener(UI_NOTICE_EVENT, handleNotice);

    return () => {
      window.removeEventListener(UI_NOTICE_EVENT, handleNotice);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div aria-live="polite" className="pda-notice-tray" role="status">
      {notices.map((notice) => (
        <div className={`pda-notice pda-notice-${notice.tone}`} key={notice.id}>
          <span className="pda-notice-label">{toneLabels[notice.tone]}</span>
          <span className="pda-notice-message">{notice.message}</span>
          <span className="pda-notice-time">{notice.time}</span>
          <button
            aria-label="Скрыть уведомление"
            className="pda-notice-close"
            onClick={() => setNotices((currentNotices) => currentNotices.filter((item) => item.id !== notice.id))}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
