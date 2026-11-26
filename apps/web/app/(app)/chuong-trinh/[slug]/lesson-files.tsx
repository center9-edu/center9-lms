'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ERROR_ALERT, FOCUS, SMALL_BUTTON } from '../../../ui/styles';
import type { LessonFile } from '../courses';
import { DOCX_TYPE, formatSize, PDF_TYPE } from '../file-types';
// Agreed 2026-11-17; the API enforces it, this only answers sooner.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const LINK = `rounded text-primary underline ${FOCUS}`;

function uploadError(status: number): string {
  switch (status) {
    case 400:
      return 'Chỉ nhận file PDF hoặc DOCX (Word). File này có thể đã bị đổi đuôi.';
    case 403:
      return 'Bạn không có quyền sửa chương trình học.';
    case 404:
      return 'Không tìm thấy bài học, có thể vừa bị xoá. Vui lòng tải lại trang.';
    case 409:
      return 'Chưa tải lên được: bài đã đủ 10 file, hoặc khoá học đã lưu trữ. Vui lòng tải lại trang.';
    case 413:
      return 'File lớn hơn 20 MB.';
    default:
      return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
  }
}

/** PDFs open in the page (and a new tab); DOCX files download under their own name. */
export function LessonFileList({ files, deleteButton }: { files: LessonFile[]; deleteButton?: (file: LessonFile) => ReactNode }) {
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {files.map((file) => {
        const href = `/tep/${file.id}`;
        const isPdf = file.mimeType === PDF_TYPE;
        return (
          <li key={file.id} className="grid gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-all">{file.fileName}</span>
              <span className="text-muted">{formatSize(file.sizeBytes)}</span>
              {isPdf ? (
                <a href={href} target="_blank" rel="noopener" className={LINK}>
                  Mở trong tab mới
                </a>
              ) : (
                <a href={href} download className={LINK}>
                  Tải về
                </a>
              )}
              {deleteButton?.(file)}
            </div>
            {isPdf && (
              <details>
                <summary className={`cursor-pointer text-primary ${FOCUS}`}>Xem PDF</summary>
                {/* Loaded only when opened: a lazy iframe inside closed <details> is not fetched. */}
                <iframe
                  src={href}
                  title={file.fileName}
                  loading="lazy"
                  className="mt-2 box-border h-[70vh] w-full rounded-lg border border-solid border-border"
                />
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Needs JavaScript: the file goes to the /tep/tai-len Route Handler, not through a Server Action (1 MB limit). */
export function UploadLessonFile({ lessonId, lessonTitle }: { lessonId: string; lessonTitle: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = body.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setMessage('Hãy chọn một file PDF hoặc DOCX.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage(uploadError(413));
      return;
    }
    setPending(true);
    setMessage(undefined);
    try {
      const res = await fetch(`/tep/tai-len/${encodeURIComponent(lessonId)}`, { method: 'POST', body });
      if (res.status === 401) {
        router.push('/dang-nhap');
        return;
      }
      if (!res.ok) {
        setMessage(uploadError(res.status));
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setMessage(uploadError(0));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={upload} className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span>Thêm file cho bài (PDF hoặc DOCX, tối đa 20 MB)</span>
          <input
            type="file"
            name="file"
            required
            accept={`.pdf,.docx,${PDF_TYPE},${DOCX_TYPE}`}
            aria-label={`File cho bài "${lessonTitle}"`}
            className={`text-sm ${FOCUS}`}
          />
        </label>
        <button type="submit" disabled={pending} className={SMALL_BUTTON}>
          {pending ? 'Đang tải lên…' : 'Tải lên'}
        </button>
      </div>
      {message && (
        <p role="alert" className={ERROR_ALERT}>
          {message}
        </p>
      )}
    </form>
  );
}
