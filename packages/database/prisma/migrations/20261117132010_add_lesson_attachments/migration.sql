-- CreateTable
CREATE TABLE "lesson_attachments" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" UUID NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_attachments_storage_key_key" ON "lesson_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "lesson_attachments_lesson_id_idx" ON "lesson_attachments"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_attachments_uploaded_by_idx" ON "lesson_attachments"("uploaded_by");

-- AddForeignKey
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express CHECK constraints.
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_size_bytes_check" CHECK ("size_bytes" > 0);
