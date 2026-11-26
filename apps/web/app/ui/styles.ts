// Shared Tailwind class strings for form controls and buttons.
export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const INPUT = `box-border w-full rounded-xl border border-solid border-border bg-white px-3.5 py-2.5 font-[inherit] text-base text-foreground transition-colors hover:border-primary/40 ${FOCUS}`;

export const PRIMARY_BUTTON = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-primary px-5 py-3 text-center font-[inherit] text-base font-semibold text-white no-underline shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-progress disabled:opacity-70 ${FOCUS}`;

export const ERROR_ALERT = 'm-0 rounded-xl bg-danger-surface px-4 py-3 text-danger';

export const LABEL = 'font-semibold';

export const SMALL_BUTTON = `inline-flex cursor-pointer items-center gap-1.5 justify-self-start rounded-lg border border-solid border-primary bg-primary px-4 py-2 font-[inherit] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-progress disabled:opacity-70 ${FOCUS}`;

export const SUCCESS_ALERT = 'm-0 rounded-xl bg-success-surface px-4 py-3 text-success';

export const CARD = 'box-border rounded-2xl border border-solid border-border bg-white p-5 shadow-card md:p-6';

// Like Trenning's "Continue": quiet until hovered.
export const OUTLINE_BUTTON = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-border bg-white px-5 py-2.5 text-center font-[inherit] text-base font-semibold text-foreground no-underline shadow-sm transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60 ${FOCUS}`;

export const DANGER_OUTLINE_BUTTON = `inline-flex cursor-pointer items-center gap-1.5 justify-self-start rounded-lg border border-solid border-danger/40 bg-white px-4 py-2 font-[inherit] text-sm font-semibold text-danger transition-colors hover:border-danger hover:bg-danger-surface disabled:cursor-progress disabled:opacity-70 ${FOCUS}`;

export const SMALL_OUTLINE_BUTTON = `inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-solid border-border bg-white px-3 py-2 font-[inherit] text-sm font-semibold text-foreground no-underline transition-colors hover:border-primary hover:text-primary ${FOCUS}`;
