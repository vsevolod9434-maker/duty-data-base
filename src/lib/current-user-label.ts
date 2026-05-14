import { apiFetchJson } from "@/lib/api-client";

type CurrentUserResponse = {
  displayName?: string | null;
  login?: string | null;
};

export async function fetchCurrentUserLabel() {
  const user = await apiFetchJson<CurrentUserResponse>("/api/auth/me");
  return user.displayName?.trim() || user.login?.trim() || "текущий пользователь";
}
