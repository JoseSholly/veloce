import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Package, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { STATUS_LABEL, StatusBadge } from '@/components/status'
import { buttonVariants } from '@/components/ui/button'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/surface'
import { api, errorMessage } from '@/lib/api'
import type { Courier, DeliveryList, DeliveryStatus, UserRole } from '@/lib/types'
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
  admin: "Here's the state of the platform today.",
}

const STATUS_ORDER: DeliveryStatus[] = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled']
const STATUS_COLOR: Record<DeliveryStatus, string> = {
  pending: 'bg-amber-500',
  assigned: 'bg-sky-500',
  picked_up: 'bg-violet-500',
  in_transit: 'bg-violet-400',
  delivered: 'bg-emerald-500',
  cancelled: 'bg-neutral-400 dark:bg-neutral-600',
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
  const isAdmin = hasRole('admin')
  const items = deliveries.data?.items ?? []
  const count = (...statuses: DeliveryStatus[]) => items.filter((d) => statuses.includes(d.status)).length
  const recent = [...items].reverse().slice(0, 6)

  const kpis = [
    { label: 'Total deliveries', value: deliveries.data?.total, note: 'All time' },
    { label: 'Awaiting courier', value: count('pending'), note: 'Pending' },
    { label: 'In progress', value: count('assigned', 'picked_up', 'in_transit'), note: 'Assigned or on the way' },
    { label: 'Completed', value: count('delivered'), note: 'Delivered' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="mt-1 text-3xl font-medium tracking-[-0.035em] sm:text-4xl">
            {greeting(now)}, {user.full_name.split(' ')[0]}
          </h1>
          <p className="mt-1.5 text-muted">{SUBTITLE[user.role]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Link to="/app/couriers/new" className={buttonVariants({ variant: 'secondary' })}>
              Add courier
            </Link>
          )}
          {hasRole('customer', 'admin') && (
            <Link to="/app/deliveries/new" className={buttonVariants()}>
              <Plus /> New delivery
            </Link>
          )}
        </div>
      </div>

      {/* KPIs */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="rounded-2xl p-5">
            <p className="text-sm text-muted">{kpi.label}</p>
            {deliveries.isPending ? (
              <Skeleton className="mt-3 h-8 w-14" />
            ) : (
              <p className="mt-2 text-3xl font-medium tracking-[-0.04em] tabular-nums">{kpi.value ?? '–'}</p>
            )}
            <p className="mt-1 text-xs text-subtle">{kpi.note}</p>
          </Card>
        ))}
      </section>
      {deliveries.data?.sampled && (
        <p className="-mt-5 text-xs text-subtle">Status figures cover your latest {SAMPLE} deliveries.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Latest deliveries */}
        <Panel
          className="lg:col-span-2"
          title="Latest deliveries"
          action={
            <Link to="/app/deliveries" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
              View all <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {deliveries.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : deliveries.isError ? (
            <ErrorState message={errorMessage(deliveries.error)} onRetry={() => void deliveries.refetch()} />
          ) : recent.length === 0 ? (
            <EmptyState icon={<Package />} title="No deliveries yet">
              {hasRole('courier')
                ? 'When a delivery is assigned to you, it shows up here.'
                : 'Your first delivery will show up here.'}
            </EmptyState>
          ) : (
            <table className="w-full text-sm">
              <thead className="hidden text-left text-xs text-subtle sm:table-header-group">
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 font-medium">Delivery</th>
                  <th className="px-5 py-2.5 font-medium">Recipient</th>
                  <th className="hidden px-5 py-2.5 font-medium md:table-cell">Route</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((delivery) => (
                  <tr key={delivery.id} className="relative transition-colors hover:bg-surface-2/60">
                    <td className="hidden px-5 py-3 font-mono text-xs whitespace-nowrap text-muted sm:table-cell">
                      {delivery.code}
                    </td>
                    <td className="px-5 py-3">
                      {/* The link's ::after covers the whole row, so any part of it opens the delivery. */}
                      <Link
                        to={`/app/deliveries/${delivery.id}`}
                        className="font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {delivery.recipient_name}
                      </Link>
                      <p className="text-muted sm:hidden">
                        {delivery.pickup.city} → {delivery.dropoff.city}
                      </p>
                    </td>
                    <td className="hidden px-5 py-3 text-muted md:table-cell">
                      {delivery.pickup.city} → {delivery.dropoff.city}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <StatusBadge status={delivery.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Side column */}
        <div className="space-y-6">
          <Panel title="Status breakdown">
            <div className="p-5">
              {deliveries.isPending ? (
                <Skeleton className="h-28" />
              ) : items.length === 0 ? (
                <p className="text-sm text-muted">Nothing to break down yet.</p>
              ) : (
                <>
                  <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    {STATUS_ORDER.map((status) => {
                      const n = count(status)
                      return n ? (
                        <span key={status} className={STATUS_COLOR[status]} style={{ width: `${(n / items.length) * 100}%` }} />
                      ) : null
                    })}
                  </div>
                  <ul className="mt-4 space-y-2.5 text-sm">
                    {STATUS_ORDER.map((status) => {
                      const n = count(status)
                      return (
                        <li key={status} className="flex items-center justify-between">
                          <span className="flex items-center gap-2.5 text-muted">
                            <span className={cn('size-2 rounded-full', STATUS_COLOR[status])} aria-hidden />
                            {STATUS_LABEL[status]}
                          </span>
                          <span className="tabular-nums">
                            {n}
                            <span className="ml-2 inline-block w-10 text-right text-subtle">
                              {Math.round((n / items.length) * 100)}%
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          </Panel>

          {isAdmin && (
            <Panel
              title="Fleet"
              action={
                <Link to="/app/couriers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
                  Manage <ArrowRight className="size-3.5" />
                </Link>
              }
            >
              <div className="p-5">
                {couriers.isPending ? (
                  <Skeleton className="h-16" />
                ) : couriers.isError ? (
                  <p className="text-sm text-red-500">{errorMessage(couriers.error)}</p>
                ) : couriers.data.length === 0 ? (
                  <p className="text-sm text-muted">
                    No couriers yet.{' '}
                    <Link to="/app/couriers/new" className="text-foreground underline underline-offset-4">
                      Add one
                    </Link>
                  </p>
                ) : (
                  <FleetSummary couriers={couriers.data} />
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('overflow-hidden rounded-2xl', className)}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

function FleetSummary({ couriers }: { couriers: Courier[] }) {
  const available = couriers.filter((c) => c.available).length
  const busy = couriers.length - available
  return (
    <>
      <p className="text-3xl font-medium tracking-[-0.04em] tabular-nums">
        {available}
        <span className="text-lg text-subtle"> / {couriers.length}</span>
      </p>
      <p className="text-sm text-muted">couriers available</p>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className="bg-emerald-500" style={{ width: `${(available / couriers.length) * 100}%` }} />
      </div>
      <div className="mt-3 flex justify-between text-xs text-subtle">
        <span>{available} available</span>
        <span>{busy} busy</span>
      </div>
    </>
  )
}
