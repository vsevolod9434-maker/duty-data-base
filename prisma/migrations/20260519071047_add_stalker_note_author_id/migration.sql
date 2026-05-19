-- AlterTable
ALTER TABLE "StalkerNote" ADD COLUMN     "createdByAccessUserId" TEXT;

-- CreateIndex
CREATE INDEX "StalkerNote_createdByAccessUserId_idx" ON "StalkerNote"("createdByAccessUserId");
