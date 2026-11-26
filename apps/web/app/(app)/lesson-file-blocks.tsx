import { Badge } from '../ui/badge';
import { Icon } from '../ui/icons';
import { CARD, SMALL_OUTLINE_BUTTON } from '../ui/styles';
import { formatSize, PDF_TYPE } from './chuong-trinh/file-types';
import { FullscreenButton } from './fullscreen-button';

/**
 * A lesson's files, each in its own numbered block: a PDF reads in the page (full screen too), a Word file
 * downloads. Shared by the curriculum page and the learner's lesson page; the API decides who may open a file.
 */
export function LessonFileBlocks({ files }: { files: { id: string; fileName: string; mimeType: string; sizeBytes: number }[] }) {
  return (
    <ol className="m-0 grid list-none gap-6 p-0">
      {files.map((file, index) => {
        const href = `/tep/${file.id}`;
        const isPdf = file.mimeType === PDF_TYPE;
        const viewerId = `viewer-${file.id}`;
        return (
          <li key={file.id} aria-labelledby={`file-${file.id}`} className={CARD}>
            <div className="flex flex-wrap items-center gap-3">
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-50 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <h2 id={`file-${file.id}`} className="m-0 min-w-0 text-base font-semibold break-all">
                {file.fileName}
              </h2>
              <Badge>{isPdf ? 'PDF' : 'Word'}</Badge>
              <span className="text-sm text-muted">{formatSize(file.sizeBytes)}</span>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                {isPdf && (
                  <>
                    <FullscreenButton targetId={viewerId} />
                    <a href={href} target="_blank" rel="noopener" className={SMALL_OUTLINE_BUTTON}>
                      <Icon name="external-link" className="size-4" />
                      Mở tab mới
                    </a>
                  </>
                )}
                <a href={href} download className={SMALL_OUTLINE_BUTTON}>
                  <Icon name="download" className="size-4" />
                  {isPdf ? 'Tải về' : 'Tải bản Word'}
                </a>
              </div>
            </div>
            {isPdf ? (
              <iframe
                id={viewerId}
                src={href}
                title={`Tài liệu: ${file.fileName}`}
                loading="lazy"
                className="mt-4 box-border h-[80vh] w-full rounded-xl border border-solid border-border bg-surface"
              />
            ) : (
              <p className="mt-3 mb-0 text-sm text-muted">Tệp Word không xem trước được trên trang. Tải về để mở bằng Word hoặc Google Docs.</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
