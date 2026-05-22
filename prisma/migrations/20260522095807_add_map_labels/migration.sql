-- CreateTable
CREATE TABLE "MapLabel" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "colorKey" TEXT NOT NULL DEFAULT 'red',
    "brightness" INTEGER NOT NULL DEFAULT 100,
    "contrast" INTEGER NOT NULL DEFAULT 100,
    "size" INTEGER NOT NULL DEFAULT 130,
    "layer" TEXT NOT NULL DEFAULT 'Основной слой',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapLabel_layer_idx" ON "MapLabel"("layer");

-- CreateIndex
CREATE INDEX "MapLabel_x_y_idx" ON "MapLabel"("x", "y");
