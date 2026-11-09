// Shared Tailwind class strings for form controls and buttons.
export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const INPUT = `box-border w-full rounded-lg border border-solid border-border bg-white px-3 py-2.5 font-[inherit] text-base text-foreground ${FOCUS}`;

export const PRIMARY_BUTTON = `inline-block cursor-pointer rounded-lg text-center no-underline border-0 bg-primary px-5 py-3 font-[inherit] text-base font-semibold text-white hover:opacity-90 disabled:cursor-progress disabled:opacity-70 ${FOCUS}`;

export const LINK_BUTTON = `cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-primary underline ${FOCUS}`;

export const ERROR_ALERT = 'm-0 rounded-lg bg-danger-surface px-3 py-2.5 text-danger';

export const LABEL = 'font-semibold';

export const SMALL_BUTTON = `cursor-pointer justify-self-start rounded-lg border border-solid border-primary bg-primary px-4 py-2 font-[inherit] text-sm font-semibold text-white hover:opacity-90 disabled:cursor-progress disabled:opacity-70 ${FOCUS}`;

export const DANGER_OUTLINE_BUTTON = `cursor-pointer justify-self-start rounded-lg border border-solid border-danger bg-white px-4 py-2 font-[inherit] text-sm font-semibold text-danger hover:bg-danger-surface disabled:cursor-progress disabled:opacity-70 ${FOCUS}`;

export const SUCCESS_ALERT = 'm-0 rounded-lg bg-success-surface px-4 py-3 text-success';

export const CARD = 'box-border rounded-xl border border-solid border-border bg-white p-5 md:p-6';

export const HINT = 'm-0 text-sm text-muted';

export const OUTLINE_BUTTON = `inline-block cursor-pointer rounded-lg border border-solid border-primary bg-white px-5 py-2.5 text-center font-[inherit] text-base font-semibold text-primary no-underline hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60 ${FOCUS}`;
