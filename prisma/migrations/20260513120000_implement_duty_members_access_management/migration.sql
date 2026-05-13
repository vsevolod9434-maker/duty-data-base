-- AlterTable
ALTER TABLE "DutyMember" ADD COLUMN "accessUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DutyMember_accessUserId_key" ON "DutyMember"("accessUserId");

-- AddForeignKey
ALTER TABLE "DutyMember" ADD CONSTRAINT "DutyMember_accessUserId_fkey" FOREIGN KEY ("accessUserId") REFERENCES "AccessUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
