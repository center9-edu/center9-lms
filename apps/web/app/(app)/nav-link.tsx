'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../ui/icons';
import type { IconName } from '../ui/icons';

export function NavLink({ href, icon, children }: { href: string; icon: IconName; children: string }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium whitespace-nowrap no-underline transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
        active ? 'bg-primary-50 font-semibold text-primary' : 'text-muted hover:bg-surface hover:text-foreground'
      }`}
    >
      <Icon name={icon} />
      {children}
    </Link>
  );
}
