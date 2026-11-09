'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: string }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`block whitespace-nowrap rounded-lg px-3 py-2 font-medium no-underline hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary ${
        active ? 'bg-primary/10 text-primary' : 'text-foreground'
      }`}
    >
      {children}
    </Link>
  );
}
