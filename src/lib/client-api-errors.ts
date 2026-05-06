type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
};

const SESSION_EXPIRED_MESSAGE = "Сеанс доступа истёк. Выполните вход повторно.";
const FORBIDDEN_MESSAGE = "Доступ к операции запрещён.";

function redirectToLogin() {
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}

export async function readClientApiError(response: Response, fallbackMessage: string) {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

  if (response.status === 401) {
    redirectToLogin();
    return SESSION_EXPIRED_MESSAGE;
  }

  if (response.status === 403) {
    return typeof payload?.message === "string" ? payload.message : FORBIDDEN_MESSAGE;
  }

  if (typeof payload?.message === "string") {
    return payload.message;
  }

  if (typeof payload?.error === "string" && payload.error !== "UNAUTHORIZED" && payload.error !== "FORBIDDEN") {
    return payload.error;
  }

  return fallbackMessage;
}
