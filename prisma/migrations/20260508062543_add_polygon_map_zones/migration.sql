-- CreateEnum
CREATE TYPE "MapZoneShape" AS ENUM ('circle', 'polygon');

-- AlterTable
ALTER TABLE "MapZone" ADD COLUMN     "shape" "MapZoneShape" NOT NULL DEFAULT 'circle';

-- CreateTable
CREATE TABLE "MapZonePoint" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,

    CONSTRAINT "MapZonePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapZonePoint_zoneId_idx" ON "MapZonePoint"("zoneId");

-- CreateIndex
CREATE INDEX "MapZonePoint_order_idx" ON "MapZonePoint"("order");

-- CreateIndex
CREATE INDEX "MapZone_shape_idx" ON "MapZone"("shape");

-- AddForeignKey
ALTER TABLE "MapZonePoint" ADD CONSTRAINT "MapZonePoint_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "MapZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
