-- CreateEnum
CREATE TYPE "MapZoneType" AS ENUM ('radiation_110', 'radiation_170', 'radiation_230', 'radiation_290', 'radiation_350', 'danger_area', 'arch_field_static', 'arch_field_unstable');

-- CreateEnum
CREATE TYPE "MapZoneStatus" AS ENUM ('active', 'inactive', 'warning');

-- CreateEnum
CREATE TYPE "MapRouteType" AS ENUM ('patrol', 'clear_sky_movement', 'military_movement', 'freedom_movement', 'bandit_movement', 'monolith_movement', 'district_transition');

-- CreateEnum
CREATE TYPE "MapRouteStatus" AS ENUM ('active', 'inactive', 'warning');

-- CreateTable
CREATE TABLE "MapZone" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MapZoneType" NOT NULL DEFAULT 'danger_area',
    "status" "MapZoneStatus" NOT NULL DEFAULT 'active',
    "centerX" INTEGER NOT NULL,
    "centerY" INTEGER NOT NULL,
    "radius" INTEGER NOT NULL,
    "description" TEXT,
    "layer" TEXT NOT NULL DEFAULT 'Основной слой',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapRoute" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MapRouteType" NOT NULL DEFAULT 'patrol',
    "status" "MapRouteStatus" NOT NULL DEFAULT 'active',
    "description" TEXT,
    "layer" TEXT NOT NULL DEFAULT 'Основной слой',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapRoutePoint" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,

    CONSTRAINT "MapRoutePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapZone_type_idx" ON "MapZone"("type");

-- CreateIndex
CREATE INDEX "MapZone_status_idx" ON "MapZone"("status");

-- CreateIndex
CREATE INDEX "MapZone_layer_idx" ON "MapZone"("layer");

-- CreateIndex
CREATE INDEX "MapZone_centerX_centerY_idx" ON "MapZone"("centerX", "centerY");

-- CreateIndex
CREATE INDEX "MapRoute_type_idx" ON "MapRoute"("type");

-- CreateIndex
CREATE INDEX "MapRoute_status_idx" ON "MapRoute"("status");

-- CreateIndex
CREATE INDEX "MapRoute_layer_idx" ON "MapRoute"("layer");

-- CreateIndex
CREATE INDEX "MapRoutePoint_routeId_idx" ON "MapRoutePoint"("routeId");

-- CreateIndex
CREATE INDEX "MapRoutePoint_order_idx" ON "MapRoutePoint"("order");

-- AddForeignKey
ALTER TABLE "MapRoutePoint" ADD CONSTRAINT "MapRoutePoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "MapRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
