-- CreateTable
CREATE TABLE "SupplyCatalogCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyCatalogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyCatalogItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contents" TEXT,
    "traderPrice" DECIMAL(12,2),
    "basePrice" DECIMAL(12,2),
    "generalPrice" DECIMAL(12,2) NOT NULL,
    "partnerPrice" DECIMAL(12,2) NOT NULL,
    "tenantPrice" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplyCatalogCategory_name_key" ON "SupplyCatalogCategory"("name");

-- CreateIndex
CREATE INDEX "SupplyCatalogCategory_sortOrder_idx" ON "SupplyCatalogCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "SupplyCatalogItem_categoryId_idx" ON "SupplyCatalogItem"("categoryId");

-- CreateIndex
CREATE INDEX "SupplyCatalogItem_kind_idx" ON "SupplyCatalogItem"("kind");

-- CreateIndex
CREATE INDEX "SupplyCatalogItem_isActive_idx" ON "SupplyCatalogItem"("isActive");

-- CreateIndex
CREATE INDEX "SupplyCatalogItem_sortOrder_idx" ON "SupplyCatalogItem"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyCatalogItem_categoryId_name_kind_key" ON "SupplyCatalogItem"("categoryId", "name", "kind");

-- AddForeignKey
ALTER TABLE "SupplyCatalogItem" ADD CONSTRAINT "SupplyCatalogItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupplyCatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
