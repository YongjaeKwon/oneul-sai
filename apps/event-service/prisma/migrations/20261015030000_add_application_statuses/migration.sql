-- AlterEnum
-- SPEC-003 D19 · SPEC-004 9절: 두 값을 끝에 붙인다 (CONFIRMED → APPLIED 순서). ADD VALUE는 되돌릴 수 없다 — PostgreSQL에 DROP VALUE가 없다.
-- PostgreSQL은 같은 트랜잭션 안에서 ADD VALUE로 더한 값을 쓰지 못한다 ("unsafe use of new value", 55P04).
-- Prisma는 마이그레이션 파일을 트랜잭션으로 감싸지 않고 문장을 하나씩 실행하므로(2026-10-15 확인 — Prisma 7.10 · PostgreSQL 17,
-- SPEC-003 17절 "개정 기록") 새 값을 쓰는 SET DEFAULT를 같은 파일에 둔다. 이 파일을 psql로 손수 적용할 때는 BEGIN … COMMIT으로 감싸지 않는다.
ALTER TYPE "ApplicationStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'APPLIED';

-- AlterTable
-- SPEC-003 D14: 신청은 접수(APPLIED)로 태어난다. 기존 PENDING 행은 "참가 가능 안내를 받은 신청"으로 읽는다 — 옮길 데이터가 없다 (9절).
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'APPLIED';
