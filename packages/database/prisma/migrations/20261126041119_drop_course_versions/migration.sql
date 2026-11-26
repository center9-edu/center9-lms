-- Hand-written (decided 2026-11-26): a course keeps one chapter tree that every class follows,
-- so course versions go. Prisma's generated SQL drops course_version_id before copying it;
-- this copies the course id first, then drops.

-- Refuse rather than guess which tree to keep.
DO $$
BEGIN
  IF EXISTS (
    SELECT v.course_id
    FROM course_versions v
    WHERE EXISTS (SELECT 1 FROM chapters c WHERE c.course_version_id = v.id)
    GROUP BY v.course_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A course has chapters in more than one version: keep the chapters of one version only, then rerun this migration';
  END IF;
END $$;

-- Copy the course id
ALTER TABLE "chapters" ADD COLUMN "course_id" UUID;
UPDATE "chapters" c SET "course_id" = v."course_id" FROM "course_versions" v WHERE v."id" = c."course_version_id";
ALTER TABLE "chapters" ALTER COLUMN "course_id" SET NOT NULL;

ALTER TABLE "classes" ADD COLUMN "course_id" UUID;
UPDATE "classes" c SET "course_id" = v."course_id" FROM "course_versions" v WHERE v."id" = c."course_version_id";
ALTER TABLE "classes" ALTER COLUMN "course_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "chapters" DROP CONSTRAINT "chapters_course_version_id_fkey";

-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_course_version_id_fkey";

-- DropForeignKey
ALTER TABLE "course_versions" DROP CONSTRAINT "course_versions_course_id_fkey";

-- DropIndex
DROP INDEX "chapters_course_version_id_position_key";

-- DropIndex
DROP INDEX "classes_course_version_id_idx";

-- AlterTable
ALTER TABLE "chapters" DROP COLUMN "course_version_id";

-- AlterTable
ALTER TABLE "classes" DROP COLUMN "course_version_id";

-- DropTable
DROP TABLE "course_versions";

-- DropEnum
DROP TYPE "course_version_status";

-- CreateIndex
CREATE UNIQUE INDEX "chapters_course_id_position_key" ON "chapters"("course_id", "position");

-- CreateIndex
CREATE INDEX "classes_course_id_idx" ON "classes"("course_id");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
