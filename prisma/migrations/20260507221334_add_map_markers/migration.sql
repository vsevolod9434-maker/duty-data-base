-- CreateEnum
CREATE TYPE "MapMarkerType" AS ENUM ('base', 'checkpoint', 'storage', 'transition', 'danger', 'point', 'housing', 'trade', 'violation', 'task', 'route_point', 'other');

-- CreateEnum
CREATE TYPE "MapMarkerStatus" AS ENUM ('active', 'inactive', 'warning', 'archived');

-- CreateTable
CREATE TABLE "MapMarker" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MapMarkerType" NOT NULL DEFAULT 'point',
    "status" "MapMarkerStatus" NOT NULL DEFAULT 'active',
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "description" TEXT,
    "layer" TEXT NOT NULL DEFAULT 'Основной слой',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapMarker_type_idx" ON "MapMarker"("type");

-- CreateIndex
CREATE INDEX "MapMarker_status_idx" ON "MapMarker"("status");

-- CreateIndex
CREATE INDEX "MapMarker_layer_idx" ON "MapMarker"("layer");

-- CreateIndex
CREATE INDEX "MapMarker_x_y_idx" ON "MapMarker"("x", "y");
