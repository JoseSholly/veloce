import { Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useTheme } from '@/theme/ThemeProvider'

/** One button: switches between light and dark. */
export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground',
        withLabel ? 'px-3 text-sm' : 'w-9',
        className,
      )}
    >
      <Icon className="size-4" />
      {withLabel && <span>{next === 'dark' ? 'Dark mode' : 'Light mode'}</span>}
    </button>
  )
}
