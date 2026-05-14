-- CreateTable
CREATE TABLE "DutyStaffSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyStaffSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyStaffPosition" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "dutyMemberId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyStaffPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DutyStaffSection_sortOrder_idx" ON "DutyStaffSection"("sortOrder");

-- CreateIndex
CREATE INDEX "DutyStaffPosition_sectionId_idx" ON "DutyStaffPosition"("sectionId");

-- CreateIndex
CREATE INDEX "DutyStaffPosition_dutyMemberId_idx" ON "DutyStaffPosition"("dutyMemberId");

-- CreateIndex
CREATE INDEX "DutyStaffPosition_sortOrder_idx" ON "DutyStaffPosition"("sortOrder");

-- AddForeignKey
ALTER TABLE "DutyStaffPosition" ADD CONSTRAINT "DutyStaffPosition_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DutyStaffSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyStaffPosition" ADD CONSTRAINT "DutyStaffPosition_dutyMemberId_fkey" FOREIGN KEY ("dutyMemberId") REFERENCES "DutyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
