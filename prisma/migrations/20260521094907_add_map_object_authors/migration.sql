-- AlterTable
ALTER TABLE "MapMarker" ADD COLUMN     "updatedBy" TEXT;

-- AlterTable
ALTER TABLE "MapRoute" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "updatedBy" TEXT;

-- AlterTable
ALTER TABLE "MapZone" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "updatedBy" TEXT;
