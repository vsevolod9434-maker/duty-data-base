export type UserRole = "system_admin" | "officer" | "manager" | "regular";

export const userRoles: Array<{ label: string; value: UserRole }> = [
  { value: "system_admin", label: "Системный администратор" },
  { value: "officer", label: "Офицерский состав" },
  { value: "manager", label: "Управляющий состав" },
  { value: "regular", label: "Рядовой состав" },
];

export function getRoleLabel(role: UserRole) {
  return userRoles.find((item) => item.value === role)?.label ?? role;
}
