-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationCancelledBy" AS ENUM ('MEMBER', 'ADMIN', 'SCHEDULE');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "cancelledBy" "ApplicationCancelledBy",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_scheduleId_createdAt_idx" ON "Application"("scheduleId", "createdAt");

-- CreateIndex
CREATE INDEX "Application_memberId_createdAt_idx" ON "Application"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_active_member_key" ON "Application"("scheduleId", "memberId") WHERE ("status" <> 'CANCELLED');

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SPEC-003 9절: Prisma 스키마가 표현하지 못하는 CHECK 제약 (손으로 추가).
ALTER TABLE "Application"
  -- 신청 참가비는 0 이상 (SPEC-002 Schedule_price_valid와 같은 기준)
  ADD CONSTRAINT "Application_price_valid" CHECK ("price" >= 0),
  -- 취소 주체는 CANCELLED일 때만, 그리고 반드시 (D1)
  ADD CONSTRAINT "Application_cancelled_by"
    CHECK (("status" = 'CANCELLED') = ("cancelledBy" IS NOT NULL));
