export type NavigationSubtab = {
  label: string;
  href: string;
};

export type NavigationItem = {
  label: string;
  href: string;
  subtabs: NavigationSubtab[];
};

export const journalTabQueryValues = {
  Задания: "tasks",
  Продажи: "sales",
  Покупки: "purchases",
  Нарушения: "violations",
} as const;

export const navigation: NavigationItem[] = [
  {
    label: "Главная",
    href: "/",
    subtabs: [],
  },
  {
    label: "Сталкеры",
    href: "/stalkers/profiles",
    subtabs: [
      { label: "Профили", href: "/stalkers/profiles" },
      { label: "Группы", href: "/stalkers/groups" },
    ],
  },
  {
    label: "Квартиры",
    href: "/apartments",
    subtabs: [],
  },
  {
    label: "Журналы",
    href: "/journals",
    subtabs: [
      { label: "Задания", href: `/journals?tab=${journalTabQueryValues.Задания}` },
      { label: "Продажи", href: `/journals?tab=${journalTabQueryValues.Продажи}` },
      { label: "Покупки", href: `/journals?tab=${journalTabQueryValues.Покупки}` },
      { label: "Нарушения", href: `/journals?tab=${journalTabQueryValues.Нарушения}` },
    ],
  },
  {
    label: "Карта",
    href: "/map",
    subtabs: [],
  },
  {
    label: "Калькулятор",
    href: "/calculator",
    subtabs: [],
  },
  {
    label: "Состав",
    href: "/duty-members",
    subtabs: [],
  },
];
