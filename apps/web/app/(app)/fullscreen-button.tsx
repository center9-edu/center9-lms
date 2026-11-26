'use client';

import { Icon } from '../ui/icons';
import { SMALL_OUTLINE_BUTTON } from '../ui/styles';

/** Shows the element with `targetId` (the PDF viewer) full screen; Esc leaves. */
export function FullscreenButton({ targetId }: { targetId: string }) {
  return (
    <button type="button" onClick={() => void document.getElementById(targetId)?.requestFullscreen()} className={SMALL_OUTLINE_BUTTON}>
      <Icon name="maximize" className="size-4" />
      Toàn màn hình
    </button>
  );
}
