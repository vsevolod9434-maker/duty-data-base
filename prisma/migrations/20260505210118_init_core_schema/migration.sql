-- CreateEnum
CREATE TYPE "StalkerProfileStatus" AS ENUM ('active', 'archive');

-- CreateEnum
CREATE TYPE "StalkerAffiliation" AS ENUM ('loner', 'duty', 'freedom', 'gopnik', 'bandit', 'mercenary', 'military', 'clear_sky');

-- CreateEnum
CREATE TYPE "StalkerGroupStatus" AS ENUM ('active', 'archive');

-- CreateEnum
CREATE TYPE "StalkerGroupRoleType" AS ENUM ('leader', 'member', 'custom');

-- CreateEnum
CREATE TYPE "ApartmentStatus" AS ENUM ('free', 'occupied');

-- CreateEnum
CREATE TYPE "ApartmentPaymentType" AS ENUM ('money', 'other');

-- CreateEnum
CREATE TYPE "TaskAssigneeType" AS ENUM ('stalker', 'group', 'manual');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('sale', 'purchase');

-- CreateEnum
CREATE TYPE "TradeSubjectType" AS ENUM ('stalker', 'group', 'manual');

-- CreateEnum
CREATE TYPE "ViolationSubjectType" AS ENUM ('profile', 'manual');

-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('active', 'closed');

-- CreateEnum
CREATE TYPE "DutyServiceStatus" AS ENUM ('active', 'leave', 'wounded', 'missing', 'discharged');

-- CreateEnum
CREATE TYPE "DutyMemberProfileStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ActivityLogType" AS ENUM ('system', 'stalker', 'group', 'apartment', 'task', 'trade', 'duty_member');

-- CreateTable
CREATE TABLE "Stalker" (
    "id" TEXT NOT NULL,
    "registryNumber" TEXT,
    "fullName" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "affiliation" "StalkerAffiliation",
    "photoUrl" TEXT,
    "appearance" TEXT,
    "notes" TEXT,
    "status" "StalkerProfileStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "Stalker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StalkerGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" "StalkerGroupStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StalkerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StalkerGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "stalkerId" TEXT NOT NULL,
    "roleType" "StalkerGroupRoleType" NOT NULL,
    "customRoleName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StalkerGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apartment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ApartmentStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentTenant" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApartmentTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentPayment" (
    "id" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentType" "ApartmentPaymentType",
    "paymentMethod" TEXT,
    "paidUntil" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "acceptedBy" TEXT,
    "issuedBy" TEXT,
    "responsibleBy" TEXT,

    CONSTRAINT "ApartmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "assigneeType" "TaskAssigneeType" NOT NULL,
    "stalkerId" TEXT,
    "groupId" TEXT,
    "manualAssigneeName" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "reward" TEXT,
    "notes" TEXT,
    "issuedBy" TEXT,
    "acceptedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOperation" (
    "id" TEXT NOT NULL,
    "type" "TradeType" NOT NULL,
    "subjectType" "TradeSubjectType" NOT NULL,
    "stalkerId" TEXT,
    "groupId" TEXT,
    "manualParticipantName" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "issuedBy" TEXT,
    "notes" TEXT,
    "operationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOperationItem" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "TradeOperationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "violatorType" "ViolationSubjectType" NOT NULL,
    "profileId" TEXT,
    "manualViolatorName" TEXT,
    "status" "ViolationStatus" NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closureNote" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "issuedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyMember" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "callSign" TEXT,
    "callsign" TEXT,
    "birthDate" TIMESTAMP(3),
    "appearance" TEXT,
    "rank" TEXT,
    "position" TEXT,
    "staffPositionId" TEXT,
    "unit" TEXT,
    "serviceStatus" "DutyServiceStatus" NOT NULL,
    "profileStatus" "DutyMemberProfileStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "type" "ActivityLogType" NOT NULL,
    "time" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StalkerGroupMember_groupId_idx" ON "StalkerGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "StalkerGroupMember_stalkerId_idx" ON "StalkerGroupMember"("stalkerId");

-- CreateIndex
CREATE INDEX "ApartmentTenant_apartmentId_idx" ON "ApartmentTenant"("apartmentId");

-- CreateIndex
CREATE INDEX "ApartmentTenant_profileId_idx" ON "ApartmentTenant"("profileId");

-- CreateIndex
CREATE INDEX "ApartmentPayment_apartmentId_idx" ON "ApartmentPayment"("apartmentId");

-- CreateIndex
CREATE INDEX "Task_stalkerId_idx" ON "Task"("stalkerId");

-- CreateIndex
CREATE INDEX "Task_groupId_idx" ON "Task"("groupId");

-- CreateIndex
CREATE INDEX "Task_assigneeType_idx" ON "Task"("assigneeType");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "TradeOperation_stalkerId_idx" ON "TradeOperation"("stalkerId");

-- CreateIndex
CREATE INDEX "TradeOperation_groupId_idx" ON "TradeOperation"("groupId");

-- CreateIndex
CREATE INDEX "TradeOperation_type_idx" ON "TradeOperation"("type");

-- CreateIndex
CREATE INDEX "TradeOperation_subjectType_idx" ON "TradeOperation"("subjectType");

-- CreateIndex
CREATE INDEX "TradeOperationItem_operationId_idx" ON "TradeOperationItem"("operationId");

-- CreateIndex
CREATE INDEX "Violation_profileId_idx" ON "Violation"("profileId");

-- CreateIndex
CREATE INDEX "Violation_violatorType_idx" ON "Violation"("violatorType");

-- CreateIndex
CREATE INDEX "Violation_status_idx" ON "Violation"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_type_idx" ON "ActivityLog"("type");

-- AddForeignKey
ALTER TABLE "StalkerGroupMember" ADD CONSTRAINT "StalkerGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StalkerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StalkerGroupMember" ADD CONSTRAINT "StalkerGroupMember_stalkerId_fkey" FOREIGN KEY ("stalkerId") REFERENCES "Stalker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentTenant" ADD CONSTRAINT "ApartmentTenant_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentTenant" ADD CONSTRAINT "ApartmentTenant_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Stalker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentPayment" ADD CONSTRAINT "ApartmentPayment_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "Apartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_stalkerId_fkey" FOREIGN KEY ("stalkerId") REFERENCES "Stalker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StalkerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOperation" ADD CONSTRAINT "TradeOperation_stalkerId_fkey" FOREIGN KEY ("stalkerId") REFERENCES "Stalker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOperation" ADD CONSTRAINT "TradeOperation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StalkerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOperationItem" ADD CONSTRAINT "TradeOperationItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "TradeOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Stalker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
