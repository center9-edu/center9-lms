-- CreateEnum
CREATE TYPE "class_status" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "class_teacher_role" AS ENUM ('MAIN_TEACHER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('ACTIVE', 'COMPLETED', 'DROPPED', 'REMOVED');

-- CreateEnum
CREATE TYPE "class_session_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "course_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "class_status" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE,
    "end_date" DATE,
    "capacity" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teachers" (
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "role_in_class" "class_teacher_role" NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_teachers_pkey" PRIMARY KEY ("class_id","teacher_id")
);

-- CreateTable
CREATE TABLE "class_enrollments" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),

    CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT,
    "status" "class_session_status" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_session_lessons" (
    "class_session_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "part_number" INTEGER NOT NULL,

    CONSTRAINT "class_session_lessons_pkey" PRIMARY KEY ("class_session_id","lesson_id","part_number")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "class_session_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL,
    "note" TEXT,
    "marked_by" UUID,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "classes_code_key" ON "classes"("code");

-- CreateIndex
CREATE INDEX "classes_course_version_id_idx" ON "classes"("course_version_id");

-- CreateIndex
CREATE INDEX "class_teachers_teacher_id_idx" ON "class_teachers"("teacher_id");

-- CreateIndex
CREATE INDEX "class_enrollments_student_id_status_idx" ON "class_enrollments"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "class_enrollments_class_id_student_id_key" ON "class_enrollments"("class_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_enrollments_id_class_id_key" ON "class_enrollments"("id", "class_id");

-- CreateIndex
CREATE INDEX "class_sessions_class_id_starts_at_idx" ON "class_sessions"("class_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_id_class_id_key" ON "class_sessions"("id", "class_id");

-- CreateIndex
CREATE INDEX "class_session_lessons_lesson_id_idx" ON "class_session_lessons"("lesson_id");

-- CreateIndex
CREATE INDEX "attendance_enrollment_id_idx" ON "attendance"("enrollment_id");

-- CreateIndex
CREATE INDEX "attendance_marked_by_idx" ON "attendance"("marked_by");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_class_session_id_enrollment_id_key" ON "attendance"("class_session_id", "enrollment_id");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_version_id_fkey" FOREIGN KEY ("course_version_id") REFERENCES "course_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_lessons" ADD CONSTRAINT "class_session_lessons_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session_lessons" ADD CONSTRAINT "class_session_lessons_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_class_session_id_class_id_fkey" FOREIGN KEY ("class_session_id", "class_id") REFERENCES "class_sessions"("id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_enrollment_id_class_id_fkey" FOREIGN KEY ("enrollment_id", "class_id") REFERENCES "class_enrollments"("id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: constraints that Prisma schema cannot express.

ALTER TABLE "classes" ADD CONSTRAINT "classes_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "classes" ADD CONSTRAINT "classes_date_range_check" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date");

-- left_at is set exactly when the student is off the class list (DROPPED or REMOVED).
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_left_at_status_check" CHECK (("status" IN ('DROPPED', 'REMOVED')) = ("left_at" IS NOT NULL));
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_left_after_enrolled_check" CHECK ("left_at" IS NULL OR "left_at" >= "enrolled_at");

ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_time_range_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "class_session_lessons" ADD CONSTRAINT "class_session_lessons_part_number_check" CHECK ("part_number" > 0);
