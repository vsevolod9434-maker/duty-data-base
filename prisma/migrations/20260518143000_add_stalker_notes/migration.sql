-- CreateTable
CREATE TABLE "StalkerNote" (
    "id" TEXT NOT NULL,
    "stalkerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StalkerNote_pkey" PRIMARY KEY ("id")
);

-- Backfill old profile notes as separate note records.
INSERT INTO "StalkerNote" ("id", "stalkerId", "text", "createdBy", "updatedBy", "createdAt", "updatedAt")
SELECT
    CONCAT('legacy-', md5("id" || COALESCE("notes", ''))),
    "id",
    "notes",
    COALESCE(NULLIF(BTRIM("createdBy"), ''), 'Сотрудник системы'),
    NULL,
    "createdAt",
    "updatedAt"
FROM "Stalker"
WHERE "notes" IS NOT NULL AND BTRIM("notes") <> ''
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE INDEX "StalkerNote_stalkerId_idx" ON "StalkerNote"("stalkerId");

-- CreateIndex
CREATE INDEX "StalkerNote_createdAt_idx" ON "StalkerNote"("createdAt");

-- AddForeignKey
ALTER TABLE "StalkerNote" ADD CONSTRAINT "StalkerNote_stalkerId_fkey" FOREIGN KEY ("stalkerId") REFERENCES "Stalker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
