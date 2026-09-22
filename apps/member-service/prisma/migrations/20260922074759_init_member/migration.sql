-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('WEB', 'ADMIN');

-- CreateEnum
CREATE TYPE "RefreshTokenStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RevokedReason" AS ENUM ('LOGOUT', 'RELOGIN', 'LIMIT', 'SUSPENDED', 'PASSWORD_CHANGED', 'REUSE');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "gender" "Gender",
    "birthYear" INTEGER,
    "phone" TEXT,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailedLoginAt" TIMESTAMP(3),
    "privacyAgreedAt" TIMESTAMP(3) NOT NULL,
    "marketingAgreedAt" TIMESTAMP(3),
    "marketingWithdrawnAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "familyStartedAt" TIMESTAMP(3) NOT NULL,
    "client" "ClientType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "RefreshTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "RevokedReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE INDEX "Member_status_idx" ON "Member"("status");

-- CreateIndex
CREATE INDEX "Member_createdAt_idx" ON "Member"("createdAt");

-- CreateIndex
CREATE INDEX "Member_phone_idx" ON "Member"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_memberId_status_idx" ON "RefreshToken"("memberId", "status");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_status_idx" ON "RefreshToken"("familyId", "status");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SPEC-001 9절: Prisma 스키마가 표현하지 못하는 CHECK 제약 (손으로 추가).
-- 탈퇴(익명화)하지 않은 회원은 이름이 있어야 하고, 그중 MEMBER는 성별 · 출생연도 · 휴대폰도 있어야 한다.
-- ADMIN은 seed로 만들며 세 값을 비워 둔다.
ALTER TABLE "Member"
  ADD CONSTRAINT "Member_required_fields"
  CHECK (
    "status" = 'WITHDRAWN'
    OR (
      "name" IS NOT NULL
      AND ("role" <> 'MEMBER' OR ("gender" IS NOT NULL AND "birthYear" IS NOT NULL AND "phone" IS NOT NULL))
    )
  );
