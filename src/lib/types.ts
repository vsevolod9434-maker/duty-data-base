export type StalkerProfileStatus = "active" | "archive";

export type StalkerAffiliation =
  | "loner"
  | "duty"
  | "freedom"
  | "gopnik"
  | "bandit"
  | "mercenary"
  | "military"
  | "clear_sky";

export type StalkerTaskMark = "none" | "active" | "overdue";

export type StalkerGroupStatus = "active" | "archive";

export type StalkerGroupRoleType = "leader" | "member" | "custom";

export type ApartmentStatus = "free" | "occupied";

export type ApartmentPaymentStatus = "none" | "paid" | "expiring" | "overdue";

export type TaskStatus = "active" | "completed" | "cancelled";

export type TaskAssigneeType = "stalker" | "group" | "manual";

export type TradeType = "sale" | "purchase";

export type TradeSubjectType = "stalker" | "group" | "manual";

export type ViolationSubjectType = "profile" | "manual";

export type DutyMemberProfileStatus = "active" | "archived";

export type DutyServiceStatus = "active" | "leave" | "wounded" | "missing" | "discharged";

export type DutyRank =
  | "\u0420\u044f\u0434\u043e\u0432\u043e\u0439"
  | "\u0415\u0444\u0440\u0435\u0439\u0442\u043e\u0440"
  | "\u041c\u043b\u0430\u0434\u0448\u0438\u0439 \u0421\u0435\u0440\u0436\u0430\u043d\u0442"
  | "\u0421\u0435\u0440\u0436\u0430\u043d\u0442"
  | "\u0421\u0442\u0430\u0440\u0448\u0438\u0439 \u0421\u0435\u0440\u0436\u0430\u043d\u0442"
  | "\u041f\u0440\u0430\u043f\u043e\u0440\u0449\u0438\u043a"
  | "\u0421\u0442\u0430\u0440\u0448\u0438\u0439 \u041f\u0440\u0430\u043f\u043e\u0440\u0449\u0438\u043a"
  | "\u0421\u0442\u0430\u0440\u0448\u0438\u043d\u0430"
  | "\u041c\u043b\u0430\u0434\u0448\u0438\u0439 \u041b\u0435\u0439\u0442\u0435\u043d\u0430\u043d\u0442"
  | "\u041b\u0435\u0439\u0442\u0435\u043d\u0430\u043d\u0442"
  | "\u0421\u0442\u0430\u0440\u0448\u0438\u0439 \u041b\u0435\u0439\u0442\u0435\u043d\u0430\u043d\u0442"
  | "\u041a\u0430\u043f\u0438\u0442\u0430\u043d"
  | "\u041c\u0430\u0439\u043e\u0440"
  | "\u041f\u043e\u0434\u043f\u043e\u043b\u043a\u043e\u0432\u043d\u0438\u043a"
  | "\u041f\u043e\u043b\u043a\u043e\u0432\u043d\u0438\u043a"
  | "\u0413\u0435\u043d\u0435\u0440\u0430\u043b";

export interface DutyStaffPosition {
  id: string;
  department: string;
  title: string;
  defaultRank?: DutyRank;
  defaultFullName?: string;
  isVacant: boolean;
}

export type JournalEntryType =
  | "system"
  | "stalker"
  | "group"
  | "apartment"
  | "task"
  | "trade"
  | "duty_member";

export interface StalkerProfile {
  id: string;
  registryNumber?: string;
  fullName: string;
  callsign: string;
  birthDate: string;
  affiliation?: StalkerAffiliation;
  photoUrl?: string;
  appearance: string;
  notes: string;
  status: StalkerProfileStatus;
  taskMark: StalkerTaskMark;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface StalkerNote {
  id: string;
  stalkerId: string;
  text: string;
  createdBy: string;
  createdByAccessUserId?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StalkerGroup {
  id: string;
  name: string;
  photoUrl?: string;
  status: StalkerGroupStatus;
  notes: string;
  members: StalkerGroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface StalkerGroupMember {
  id: string;
  stalkerId: string;
  roleType: StalkerGroupRoleType;
  customRoleName: string | null;
  joinedAt: string;
}

export interface Apartment {
  id: string;
  name: string;
  status: ApartmentStatus;
  tenants: ApartmentTenant[];
  payments: ApartmentPayment[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApartmentTenant {
  id: string;
  profileId: string;
  addedAt: string;
}

export interface ApartmentPayment {
  id: string;
  paidAt: string;
  amount: number;
  paymentType?: "money" | "other";
  paymentMethod?: string;
  paidUntil: string;
  notes: string;
  createdAt: string;
  acceptedBy?: string;
  issuedBy?: string;
  responsibleBy?: string;
}

export interface Task {
  id: string;
  assigneeType: TaskAssigneeType;
  stalkerId: string | null;
  groupId: string | null;
  manualAssigneeName?: string;
  issuedAt: string;
  dueAt: string;
  description: string;
  reward: string;
  notes: string;
  issuedBy: string;
  acceptedBy: string | null;
  completedAt: string | null;
  status: TaskStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface TradeOperation {
  id: string;
  type: TradeType;
  subjectType: TradeSubjectType;
  stalkerId: string | null;
  groupId: string | null;
  manualParticipantName?: string;
  items: TradeItem[];
  totalAmount: number;
  issuedBy: string;
  notes: string;
  operationDate?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TradeItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes: string;
}

export interface DutyMember {
  id: string;
  fullName: string;
  callSign: string;
  callsign?: string;
  birthDate: string;
  appearance: string;
  rank: string;
  position: string;
  staffPositionId?: string;
  unit: string;
  serviceStatus: DutyServiceStatus;
  status?: string;
  profileStatus: DutyMemberProfileStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Violation {
  id: string;
  violatorType: ViolationSubjectType;
  profileId?: string;
  manualViolatorName?: string;
  status?: "active" | "closed";
  closedAt?: string;
  closureNote?: string;
  date: string;
  description: string;
  issuedBy: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  type: JournalEntryType;
  time: string;
  title: string;
  status: string;
  description: string;
  createdAt?: string;
}
