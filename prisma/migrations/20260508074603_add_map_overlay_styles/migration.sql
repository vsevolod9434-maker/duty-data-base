-- AlterTable
ALTER TABLE "MapRoute" ADD COLUMN     "colorKey" TEXT NOT NULL DEFAULT 'neutral',
ADD COLUMN     "linePattern" TEXT NOT NULL DEFAULT 'dashed';

-- AlterTable
ALTER TABLE "MapZone" ADD COLUMN     "colorKey" TEXT NOT NULL DEFAULT 'danger';
