-- CreateEnum
CREATE TYPE "AccessUserRole" AS ENUM ('system_admin', 'officer', 'manager', 'regular');

-- CreateTable
CREATE TABLE "AccessUser" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "authEmail" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "normalizedLogin" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "AccessUserRole" NOT NULL DEFAULT 'regular',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessUser_authUserId_key" ON "AccessUser"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessUser_authEmail_key" ON "AccessUser"("authEmail");

-- CreateIndex
CREATE UNIQUE INDEX "AccessUser_normalizedLogin_key" ON "AccessUser"("normalizedLogin");

-- CreateIndex
CREATE INDEX "AccessUser_role_idx" ON "AccessUser"("role");

-- CreateIndex
CREATE INDEX "AccessUser_isActive_idx" ON "AccessUser"("isActive");
