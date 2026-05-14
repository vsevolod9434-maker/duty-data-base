export type NavigationSubtab = {
  label: string;
  href: string;
};

export type NavigationItem = {
  label: string;
  href: string;
  subtabs: NavigationSubtab[];
};

export const navigation: NavigationItem[] = [
  {
    label: "Главная",
    href: "/",
    subtabs: [
      { label: "Обзор", href: "#overview" },
      { label: "Сводка", href: "#summary" },
      { label: "Состояние", href: "#system" },
    ],
  },
  {
    label: "Сталкеры",
    href: "/stalkers/profiles",
    subtabs: [
      { label: "Профили", href: "/stalkers/profiles" },
      { label: "Группы", href: "/stalkers/groups" },
      { label: "Квартиры", href: "/apartments" },
    ],
  },
  {
    label: "Журналы",
    href: "/journals",
    subtabs: [
      { label: "Задания", href: "#" },
      { label: "Продажи", href: "#" },
      { label: "Покупки", href: "#" },
      { label: "Нарушения", href: "#" },
    ],
  },
  {
    label: "Карта",
    href: "/map",
    subtabs: [],
  },
  {
    label: "Состав",
    href: "/duty-members",
    subtabs: [
      { label: "Профили состава", href: "/duty-members" },
      { label: "Штатный список", href: "/duty-members/staff-list" },
    ],
  },
];
