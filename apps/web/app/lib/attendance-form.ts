/**
 * The API body for an attendance form: one `enrollmentId` field per student on the sheet, and for each a
 * `status-<id>` radio and a `note-<id>` box. A student without a chosen status is left out, so it is not cleared.
 */
export function attendanceBody(formData: FormData): {
  records: { enrollmentId: string; status: string; note: string | null }[];
  taughtBy?: string;
} {
  const text = (name: string) => String(formData.get(name) ?? '').trim();
  const records = formData.getAll('enrollmentId').flatMap((value) => {
    const enrollmentId = String(value);
    const status = text(`status-${enrollmentId}`);
    return status ? [{ enrollmentId, status, note: text(`note-${enrollmentId}`) || null }] : [];
  });
  const taughtBy = text('taughtBy');
  return taughtBy ? { records, taughtBy } : { records };
}
