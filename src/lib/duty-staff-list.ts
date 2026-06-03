export type CanonicalDutyStaffPosition = {
  id: string;
  title: string;
  sortOrder: number;
};

export type CanonicalDutyStaffSection = {
  id: string;
  name: string;
  sortOrder: number;
  positions: CanonicalDutyStaffPosition[];
};

export const canonicalDutyStaffSections: CanonicalDutyStaffSection[] = [
  {
    id: "command",
    name: "Управление",
    sortOrder: 1,
    positions: [
      {
        id: "command-01",
        title: "Командир отряда специального назначения",
        sortOrder: 1,
      },
      {
        id: "command-02",
        title:
          "Заместитель командира отряда специального назначения по воспитательной и политической работе с личным составом",
        sortOrder: 2,
      },
      {
        id: "command-03",
        title: "Старшина отряда специального назначения (начальник службы тыла)",
        sortOrder: 3,
      },
    ],
  },
  {
    id: "combat-training",
    name: "Отдел боевой подготовки",
    sortOrder: 2,
    positions: [
      {
        id: "combat-training-01",
        title: "Начальник отдела (инструктор по боевой подготовке личного состава)",
        sortOrder: 1,
      },
    ],
  },
  {
    id: "special-department",
    name: "Особый отдел",
    sortOrder: 3,
    positions: [
      {
        id: "special-department-01",
        title: "Начальник особого отдела",
        sortOrder: 1,
      },
      {
        id: "special-department-02",
        title: "Группа разведки (подв. особ. отд.)",
        sortOrder: 2,
      },
      {
        id: "special-department-03",
        title: "Группа разведки (подв. особ. отд.)",
        sortOrder: 3,
      },
    ],
  },
  {
    id: "rear-service",
    name: "Служба тыла",
    sortOrder: 4,
    positions: [
      {
        id: "rear-service-01",
        title: "Старшина отряда специального назначения (начальник службы тыла)",
        sortOrder: 1,
      },
      {
        id: "rear-service-02",
        title: "Снабженец службы тыла",
        sortOrder: 2,
      },
      {
        id: "rear-service-03",
        title: "Снабженец службы тыла",
        sortOrder: 3,
      },
    ],
  },
  {
    id: "medical-service",
    name: "Медицинская служба",
    sortOrder: 5,
    positions: [
      {
        id: "medical-service-01",
        title: "Начальник медицинской службы (военврач/санинструктор)",
        sortOrder: 1,
      },
      {
        id: "medical-service-02",
        title: "Санинструктор",
        sortOrder: 2,
      },
    ],
  },
  {
    id: "research-corps",
    name: "Научно-исследовательский корпус",
    sortOrder: 6,
    positions: [
      {
        id: "research-corps-01",
        title: "Начальник корпуса (ведущий исследователь)",
        sortOrder: 1,
      },
      {
        id: "research-corps-02",
        title: "Специалист",
        sortOrder: 2,
      },
    ],
  },
  {
    id: "fighter-platoon",
    name: "Взвод истребителей",
    sortOrder: 7,
    positions: [
      {
        id: "fighter-platoon-01",
        title: "Командир взвода истребителей",
        sortOrder: 1,
      },
      {
        id: "fighter-platoon-02",
        title: "Заместитель командира взвода истребителей",
        sortOrder: 2,
      },
    ],
  },
  {
    id: "first-squad",
    name: "1-е отделение",
    sortOrder: 8,
    positions: [
      {
        id: "first-squad-01",
        title: "Командир отделения",
        sortOrder: 1,
      },
      {
        id: "first-squad-02",
        title: "Старший стрелок",
        sortOrder: 2,
      },
      {
        id: "first-squad-03",
        title: "Стрелок",
        sortOrder: 3,
      },
      {
        id: "first-squad-04",
        title: "Стрелок",
        sortOrder: 4,
      },
      {
        id: "first-squad-05",
        title: "Снайпер",
        sortOrder: 5,
      },
    ],
  },
  {
    id: "second-squad",
    name: "2-е отделение",
    sortOrder: 9,
    positions: [
      {
        id: "second-squad-01",
        title: "Командир отделения",
        sortOrder: 1,
      },
      {
        id: "second-squad-02",
        title: "Старший стрелок",
        sortOrder: 2,
      },
      {
        id: "second-squad-03",
        title: "Стрелок",
        sortOrder: 3,
      },
      {
        id: "second-squad-04",
        title: "Стрелок",
        sortOrder: 4,
      },
      {
        id: "second-squad-05",
        title: "Снайпер",
        sortOrder: 5,
      },
    ],
  },
];

export const canonicalDutyStaffSectionIds = canonicalDutyStaffSections.map((section) => section.id);

export const canonicalDutyStaffPositionIds = canonicalDutyStaffSections.flatMap((section) =>
  section.positions.map((position) => position.id),
);
