export type DashboardTaskSummary = {
  id: string;
  description: string;
  status: "active" | "completed" | "cancelled";
  dueAt: string | null;
  issuedAt: string;
  assigneeLabel: string;
};

export type DashboardTradeSummary = {
  id: string;
  type: "sale" | "purchase";
  totalAmount: number;
  operationDate: string | null;
  participantLabel: string;
};

export type DashboardViolationSummary = {
  id: string;
  description: string;
  status: "active" | "closed";
  date: string;
  violatorLabel: string;
};

export type DashboardSummaryResponse = {
  profiles: {
    active: number;
    archive: number;
    total: number;
  };
  groups: {
    active: number;
    archive: number;
    total: number;
  };
  apartments: {
    free: number;
    occupied: number;
    total: number;
    overduePayments: number;
    expiringPayments: number;
  };
  tasks: {
    active: number;
    completed: number;
    cancelled: number;
    overdue: number;
    total: number;
  };
  violations: {
    active: number;
    closed: number;
    total: number;
  };
  trade: {
    salesCount: number;
    purchasesCount: number;
    salesTotal: number;
    purchasesTotal: number;
  };
  recent: {
    tasks: DashboardTaskSummary[];
    tradeOperations: DashboardTradeSummary[];
    violations: DashboardViolationSummary[];
  };
};
