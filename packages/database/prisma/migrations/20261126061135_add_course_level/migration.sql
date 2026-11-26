-- Hand-written default (decided 2026-11-26): every course has exactly one level. Existing courses
-- start as BASIC for staff to correct; the default is then dropped, so new rows must name a level.

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'BASIC';
ALTER TABLE "courses" ALTER COLUMN "level" DROP DEFAULT;
