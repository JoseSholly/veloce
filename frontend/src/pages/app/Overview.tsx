import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { StatusBadge } from '@/components/status'
import { buttonVariants } from '@/components/ui/button'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/surface'
import { api, errorMessage } from '@/lib/api'
import type { Courier, Delivery, DeliveryList, DeliveryStatus, UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'

const SAMPLE = 100

function greeting(date: Date) {
  const hour = date.getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const SUBTITLE: Record<UserRole, string> = {
  customer: "Here's where your deliveries stand.",
  courier: "Here's what is assigned to you.",
  admin: "Here's the state of the platform.",
}

/**
 * The API lists deliveries oldest first and has no per-status counts yet, so
 * the overview reads the newest pages (up to 100 deliveries) and counts those.
 * The total is always exact.
 */
async function fetchLatest(signal: AbortSignal) {
  const first = await api<DeliveryList>(`/deliveries?page=1&page_size=${SAMPLE}`, { signal })
  if (first.total <= SAMPLE) return { total: first.total, items: first.items, sampled: false }

  const lastPage = Math.ceil(first.total / SAMPLE)
  const [previous, last] = await Promise.all([
    lastPage - 1 === 1
      ? Promise.resolve(first)
      : api<DeliveryList>(`/deliveries?page=${lastPage - 1}&page_size=${SAMPLE}`, { signal }),
    api<DeliveryList>(`/deliveries?page=${lastPage}&page_size=${SAMPLE}`, { signal }),
  ])
  return { total: first.total, items: [...previous.items, ...last.items].slice(-SAMPLE), sampled: true }
}

export function OverviewPage() {
  const { user, hasRole } = useAuth()
  const [now] = useState(() => new Date())

  const deliveries = useQuery({
    queryKey: ['deliveries', 'overview'],
    queryFn: ({ signal }) => fetchLatest(signal),
  })
  const couriers = useQuery({
    queryKey: ['couriers', 'all'],
    queryFn: ({ signal }) => api<Courier[]>('/couriers', { signal }),
    enabled: hasRole('admin'),
  })

  if (!user) return null
  const firstName = user.full_name.split(' ')[0]

  const count = (...statuses: DeliveryStatus[]) =>
    deliveries.data?.items.filter((d) => statuses.includes(d.status)).length ?? 0

  const stats: { label: string; value: number | string; hint?: string }[] = [
    { label: 'Deliveries', value: deliveries.data?.total ?? '–', hint: 'All time' },
    { label: 'Waiting for a courier', value: count('pending') },
    { label: 'On the way', value: count('assigned', 'picked_up', 'in_transit') },
    { label: 'Delivered', value: count('delivered') },
  ]
  if (hasRole('admin') && couriers.data) {
    const available = couriers.data.filter((c) => c.available).length
    stats.splice(1, 0, { label: 'Couriers available', value: `${available}/${couriers.data.length}` })
  }

  const recent = deliveries.data ? [...deliveries.data.items].reverse().slice(0, 5) : []

  return (
    <>
      {/* Greeting */}
      <div className="animate-rise">
        <p className="font-mono text-xs tracking-[0.18em] text-subtle uppercase">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
          {greeting(now)}, {firstName}.
        </h1>
        <p className="mt-3 text-lg text-muted">{SUBTITLE[user.role]}</p>
      </div>

      {/* Quick actions */}
      <div className="animate-rise mt-8 flex flex-wrap gap-2" style={{ animationDelay: '80ms' }}>
        {hasRole('customer', 'admin') && (
          <Link to="/app/deliveries/new" className={buttonVariants()}>
            <Plus /> New delivery
          </Link>
        )}
        {hasRole('admin') && (
          <Link to="/app/couriers" className={buttonVariants({ variant: 'secondary' })}>
            Manage couriers
          </Link>
        )}
        <Link to="/app/deliveries" className={buttonVariants({ variant: 'secondary' })}>
          All deliveries
        </Link>
      </div>

      {/* Numbers */}
      <div
        className={cn('animate-rise mt-10 grid grid-cols-2 gap-3', stats.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}
        style={{ animationDelay: '160ms' }}
      >
        {stats.map((stat, i) => (
          <Card
            key={stat.label}
            // With an odd number of cards, the first spans both phone columns.
            className={cn('rounded-2xl p-5', i === 0 && stats.length % 2 === 1 && 'col-span-2 lg:col-span-1')}
          >
            <p className="text-sm text-muted">{stat.label}</p>
            {deliveries.isPending ? (
              <Skeleton className="mt-3 h-9 w-16" />
            ) : (
              <p className="mt-2 text-4xl font-medium tracking-[-0.04em] tabular-nums">{stat.value}</p>
            )}
            {stat.hint && <p className="mt-1 text-xs text-subtle">{stat.hint}</p>}
          </Card>
        ))}
      </div>
      {deliveries.data?.sampled && (
        <p className="mt-3 text-xs text-subtle">Status counts cover your latest {SAMPLE} deliveries.</p>
      )}

      {/* Recent */}
      <section className="animate-rise mt-12" style={{ animationDelay: '240ms' }}>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-medium tracking-tight">Latest deliveries</h2>
          <Link to="/app/deliveries" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            View all <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <Card className="overflow-hidden rounded-2xl">
          {deliveries.isPending ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : deliveries.isError ? (
            <ErrorState message={errorMessage(deliveries.error)} onRetry={() => void deliveries.refetch()} />
          ) : recent.length === 0 ? (
            <EmptyState icon={<Plus />} title="Nothing here yet">
              {hasRole('courier')
                ? 'When a delivery is assigned to you, it shows up here.'
                : 'Your first delivery will show up here.'}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((delivery: Delivery) => (
                <li key={delivery.id}>
                  <Link
                    to={`/app/deliveries/${delivery.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
                  >
                    <span className="hidden w-12 font-mono text-sm text-subtle sm:block">#{delivery.id}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{delivery.recipient_name}</p>
                      <p className="truncate text-sm text-muted">
                        {delivery.pickup.city} → {delivery.dropoff.city}
                      </p>
                    </div>
                    <StatusBadge status={delivery.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  )
}
