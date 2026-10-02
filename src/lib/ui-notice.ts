export const UI_NOTICE_EVENT = "duty-rp-ui-notice";

export type UiNoticeTone = "ok" | "warn" | "error";

export type UiNoticeDetail = {
  message: string;
  tone: UiNoticeTone;
};

export function showUiNotice(message: string, tone: UiNoticeTone = "ok") {
  if (typeof window === "undefined" || !message.trim()) {
    return;
  }

  window.dispatchEvent(new CustomEvent<UiNoticeDetail>(UI_NOTICE_EVENT, { detail: { message, tone } }));
}

export function getNoticeToneFromStatus(status: string): UiNoticeTone {
  const normalizedStatus = status.trim().toUpperCase();

  if (normalizedStatus === "ERROR" || normalizedStatus === "FAIL") {
    return "error";
  }

  return normalizedStatus === "OK" ? "ok" : "warn";
}
