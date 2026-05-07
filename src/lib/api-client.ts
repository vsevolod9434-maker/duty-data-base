import { readClientApiError } from "@/lib/client-api-errors";

const DEFAULT_API_ERROR_MESSAGE = "Не удалось выполнить операцию. Повторите попытку позже.";

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit, fallbackMessage = DEFAULT_API_ERROR_MESSAGE) {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(await readClientApiError(response, fallbackMessage));
  }

  return response;
}

export async function apiFetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage = DEFAULT_API_ERROR_MESSAGE,
) {
  const response = await apiFetch(input, init, fallbackMessage);
  return (await response.json()) as T;
}
