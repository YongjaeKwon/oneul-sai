-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Meetup" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Meetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "meetupId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "applyDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "priceMale" INTEGER NOT NULL,
    "priceFemale" INTEGER NOT NULL,
    "capacityMale" INTEGER NOT NULL,
    "capacityFemale" INTEGER NOT NULL,
    "maleMinBirthYear" INTEGER,
    "maleMaxBirthYear" INTEGER,
    "venueArea" TEXT NOT NULL,
    "venueName" TEXT,
    "venueAddress" TEXT,
    "venueDirections" TEXT,
    "venueMapUrl" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Schedule_meetupId_startsAt_idx" ON "Schedule"("meetupId", "startsAt");

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_meetupId_fkey" FOREIGN KEY ("meetupId") REFERENCES "Meetup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SPEC-002 9절: Prisma 스키마가 표현하지 못하는 CHECK 제약 (손으로 추가).
ALTER TABLE "Schedule"
  -- 남녀 참가비 각각 0 이상. 두 값의 관계는 검사하지 않는다. 상한(1,000,000)은 입력 실수 방지라 스키마에만 둔다 (D3)
  ADD CONSTRAINT "Schedule_price_valid"
    CHECK ("priceMale" >= 0 AND "priceFemale" >= 0),
  -- 성별 정원 각각 1~50. 남녀가 달라도 된다 (D2)
  ADD CONSTRAINT "Schedule_capacity_valid"
    CHECK ("capacityMale" BETWEEN 1 AND 50 AND "capacityFemale" BETWEEN 1 AND 50),
  -- 신청 마감 ≤ 시작 < 종료 (D7). 동시 수정 경합의 최종 방어선 (11절)
  ADD CONSTRAINT "Schedule_time_order"
    CHECK ("applyDeadlineAt" <= "startsAt" AND "startsAt" < "endsAt"),
  -- 남성 연령대: 출생연도 1900 이상, min ≤ max (D5)
  ADD CONSTRAINT "Schedule_male_birth_year_valid"
    CHECK (
      ("maleMinBirthYear" IS NULL OR "maleMinBirthYear" >= 1900)
      AND ("maleMaxBirthYear" IS NULL OR "maleMaxBirthYear" >= 1900)
      AND ("maleMinBirthYear" IS NULL OR "maleMaxBirthYear" IS NULL OR "maleMinBirthYear" <= "maleMaxBirthYear")
    ),
  -- 지도 링크는 https만 — 입력 경로 밖(직접 UPDATE 등)에서도 javascript: · data: 가 저장되지 않게 (D4, 12절)
  ADD CONSTRAINT "Schedule_venue_map_url_https"
    CHECK ("venueMapUrl" IS NULL OR "venueMapUrl" LIKE 'https://%'),
  -- 취소 사유는 CANCELLED일 때만, 그리고 반드시 (D8)
  ADD CONSTRAINT "Schedule_cancel_reason"
    CHECK (("status" = 'CANCELLED') = ("cancelReason" IS NOT NULL));
