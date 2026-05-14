export type AccessUserDisplaySource = {
  displayName?: string | null;
  login?: string | null;
};

export function getAccessUserDisplayName(accessUser: AccessUserDisplaySource) {
  return accessUser.displayName?.trim() || accessUser.login?.trim() || "Сотрудник системы";
}
