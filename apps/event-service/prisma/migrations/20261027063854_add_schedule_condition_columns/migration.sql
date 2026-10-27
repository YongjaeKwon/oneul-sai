-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "femaleMaxBirthYear" INTEGER,
ADD COLUMN     "femaleMinBirthYear" INTEGER,
ADD COLUMN     "minPerGender" INTEGER,
ADD COLUMN     "participantCondition" TEXT,
ADD COLUMN     "priceNote" TEXT;

-- SPEC-002 9절 (개정 2026-10-14): Prisma 스키마가 표현하지 못하는 CHECK 제약 (손으로 추가).
-- 다섯 열 모두 nullable · DB 기본값 없음이라 기존 행은 NULL로 남는다 — 옮길 데이터가 없다.
-- 텍스트 두 열(participantCondition · priceNote)의 길이 상한은 입력 실수 방지라 스키마(Zod)에만 둔다 (D3와 같은 기준).
ALTER TABLE "Schedule"
  -- 여성 연령대: 남성 CHECK와 같은 모양 (D16)
  ADD CONSTRAINT "Schedule_female_birth_year_valid"
    CHECK (
      ("femaleMinBirthYear" IS NULL OR "femaleMinBirthYear" >= 1900)
      AND ("femaleMaxBirthYear" IS NULL OR "femaleMaxBirthYear" >= 1900)
      AND ("femaleMinBirthYear" IS NULL OR "femaleMaxBirthYear" IS NULL OR "femaleMinBirthYear" <= "femaleMaxBirthYear")
    ),
  -- 성별 최소 인원 1~50. 정원과의 관계는 검사하지 않는다 — 운영자 화면이 경고만 한다 (D17)
  ADD CONSTRAINT "Schedule_min_per_gender_valid"
    CHECK ("minPerGender" IS NULL OR "minPerGender" BETWEEN 1 AND 50);
