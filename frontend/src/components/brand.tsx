import { Link } from 'react-router'

import { cn } from '@/lib/utils'

/** The Veloce mark: a V crossed by a fast arc. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5 text-foreground', className)} aria-label="Veloce home">
      <svg viewBox="0 0 32 24" className="h-6 w-8" aria-hidden>
        <path
          d="M6 5l10 15 10-15"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M2 9.5c8-5.5 18-6.5 29-3" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">veloce</span>
    </Link>
  )
}
