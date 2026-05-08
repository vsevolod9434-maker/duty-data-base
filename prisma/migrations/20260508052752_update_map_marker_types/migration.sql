-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MapMarkerType" ADD VALUE 'possible_shelter';
ALTER TYPE "MapMarkerType" ADD VALUE 'trader';
ALTER TYPE "MapMarkerType" ADD VALUE 'unstable_bubble';
ALTER TYPE "MapMarkerType" ADD VALUE 'pripyat3_bubble';

-- AlterTable
ALTER TABLE "MapMarker" ALTER COLUMN "type" SET DEFAULT 'route_point';
