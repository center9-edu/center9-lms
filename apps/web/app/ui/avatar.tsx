import { colorIndex, initialOf } from '../lib/names';

// White text on each of these is at least 5.4:1 (WCAG AA).
const COLORS = ['bg-primary', 'bg-success', 'bg-warning', 'bg-danger', 'bg-[#0f766e]', 'bg-[#6d28d9]'];

const SIZES = { sm: 'size-8 text-sm', md: 'size-10 text-base', lg: 'size-16 text-2xl' };

/** The initial of a person's given name on a color picked from their name. Decorative: the name is always shown next to it. */
export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof SIZES }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${SIZES[size]} ${COLORS[colorIndex(name, COLORS.length)]}`}>
      {initialOf(name)}
    </span>
  );
}
