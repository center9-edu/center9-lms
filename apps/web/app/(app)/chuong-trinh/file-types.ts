// Lesson file types and sizes, for server pages and client components alike (no server-only imports here).

export const PDF_TYPE = 'application/pdf';
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
