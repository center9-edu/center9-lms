-- Hand-written default (decided 2026-11-26): every course has exactly one subject (shown as "Nhóm").
-- Existing courses are mock data and start as SCRATCH; the default is then dropped, so new rows must name a subject.

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "subject" TEXT NOT NULL DEFAULT 'SCRATCH';
ALTER TABLE "courses" ALTER COLUMN "subject" DROP DEFAULT;
