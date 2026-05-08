-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MapMarkerType" ADD VALUE 'question';
ALTER TYPE "MapMarkerType" ADD VALUE 'exclamation';
ALTER TYPE "MapMarkerType" ADD VALUE 'radiation';

-- AlterTable
ALTER TABLE "MapMarker" ADD COLUMN     "size" INTEGER NOT NULL DEFAULT 100;
