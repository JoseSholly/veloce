import { useQuery } from '@tanstack/react-query'

import { Pill } from '@/components/ui/surface'
import { fetchReadiness } from '@/lib/api'
import type { DeliveryStatus, UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<DeliveryStatus, string> = {
  pending: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  assigned: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  picked_up: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  in_transit: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  delivered: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  cancelled: 'bg-surface-3 text-muted',
}

// oxlint-disable-next-line react/only-export-components
export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <Pill className={STATUS_STYLE[status]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </Pill>
  )
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Pill className="bg-surface-2 capitalize text-muted">{role}</Pill>
}

/** A live dot showing whether the backend and its dependencies are ready. */
export function ApiStatus({ className }: { className?: string }) {
  const { data, isError } = useQuery({
    queryKey: ['readiness'],
    queryFn: ({ signal }) => fetchReadiness(signal),
    refetchInterval: 15_000,
    retry: false,
  })

  const state = isError ? 'down' : !data ? 'checking' : data.status === 'ready' ? 'up' : 'degraded'
  const label = {
    up: 'All systems operational',
    degraded: 'Degraded',
    down: 'API unreachable',
    checking: 'Checking…',
  }[state]
  const color = {
    up: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    down: 'bg-red-500',
    checking: 'bg-subtle',
  }[state]

  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <span className={cn('size-2 rounded-full animate-pulse-dot', color)} aria-hidden />
      {label}
    </span>
  )
}
