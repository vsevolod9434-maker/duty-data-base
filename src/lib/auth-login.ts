export type LoginValidationResult =
  | { ok: true; normalizedLogin: string }
  | { ok: false; error: string };

export function normalizeLogin(login: string) {
  return login
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ");
}

export function validateLogin(login: string): LoginValidationResult {
  const trimmedLogin = login.trim();

  if (!trimmedLogin) {
    return { ok: false, error: "Введите логин." };
  }

  const normalizedLogin = normalizeLogin(login);

  if (normalizedLogin.length < 2) {
    return { ok: false, error: "Логин слишком короткий." };
  }

  if (normalizedLogin.length > 64) {
    return { ok: false, error: "Логин слишком длинный." };
  }

  return { ok: true, normalizedLogin };
}
