-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "taught_by" UUID;

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "schedule_end_time" TEXT,
ADD COLUMN     "schedule_start_time" TEXT,
ADD COLUMN     "schedule_weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateIndex
CREATE INDEX "class_sessions_taught_by_idx" ON "class_sessions"("taught_by");

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_taught_by_fkey" FOREIGN KEY ("taught_by") REFERENCES "teacher_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express CHECK constraints.
-- ISO weekdays only (1 = Monday … 7 = Sunday), and a pattern has both times or neither.
ALTER TABLE "classes" ADD CONSTRAINT "classes_schedule_weekdays_check" CHECK ("schedule_weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]);
ALTER TABLE "classes" ADD CONSTRAINT "classes_schedule_times_check" CHECK (("schedule_start_time" IS NULL) = ("schedule_end_time" IS NULL));
