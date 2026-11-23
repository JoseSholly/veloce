import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Package, Plus, Truck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/layout'
import { STATUS_LABEL, StatusBadge } from '@/components/status'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/surface'
import { api, ApiError, errorMessage } from '@/lib/api'
import type { Courier, Delivery, DeliveryCreate, DeliveryList, DeliveryStatus, Location } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10
const CANCELLABLE: DeliveryStatus[] = ['pending', 'assigned']


/* --------------------------------- List ---------------------------------- */

export function DeliveriesPage() {
  const { user, hasRole } = useAuth()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)

  const query = useQuery({
    queryKey: ['deliveries', page],
    queryFn: ({ signal }) => api<DeliveryList>(`/deliveries?page=${page}&page_size=${PAGE_SIZE}`, { signal }),
    placeholderData: keepPreviousData,
  })

  const canCreate = hasRole('customer', 'admin')
  const description = {
    customer: 'Deliveries you have requested.',
    courier: 'Deliveries assigned to you.',
    admin: 'Every delivery on the platform.',
  }[user!.role]

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1
  const goTo = (next: number) => setParams(next === 1 ? {} : { page: String(next) })

  return (
    <>
      <PageHeader
        title="Deliveries"
        description={description}
        actions={
          canCreate && (
            <Link to="/app/deliveries/new" className={buttonVariants()}>
              <Plus /> New delivery
            </Link>
          )
        }
      />

      <Card className="overflow-hidden rounded-2xl">
        {query.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="No deliveries yet"
            action={
              canCreate && (
                <Link to="/app/deliveries/new" className={buttonVariants({ size: 'sm' })}>
                  <Plus /> Request a delivery
                </Link>
              )
            }
          >
            {hasRole('courier')
              ? 'When an admin assigns you a delivery, it appears here.'
              : 'Request your first delivery and it will show up here.'}
          </EmptyState>
        ) : (
          <table className={cn('w-full text-sm', query.isPlaceholderData && 'opacity-60')}>
            <thead className="hidden text-left text-xs text-subtle sm:table-header-group">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Delivery</th>
                <th className="px-5 py-3 font-medium">Recipient</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Route</th>
                <th className="hidden px-5 py-3 font-medium lg:table-cell">Courier</th>
                <th className="px-5 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data.items.map((delivery) => (
                <tr key={delivery.id} className="relative transition-colors hover:bg-surface-2/60">
                  <td className="hidden px-5 py-3.5 font-mono text-xs whitespace-nowrap text-muted sm:table-cell">
                    {delivery.code}
                  </td>
                  <td className="max-w-0 px-5 py-3.5">
                    {/* The link's ::after covers the whole row, so any part of it opens the delivery. */}
                    <Link
                      to={`/app/deliveries/${delivery.id}`}
                      className="block truncate font-medium after:absolute after:inset-0 after:content-['']"
                    >
                      {delivery.recipient_name}
                    </Link>
                    <p className="truncate text-muted">
                      <span className="font-mono text-xs sm:hidden">{delivery.code} · </span>
                      <span className="md:hidden">{delivery.pickup.city} → {delivery.dropoff.city} · </span>
                      {delivery.package_description}
                    </p>
                  </td>
                  <td className="hidden px-5 py-3.5 whitespace-nowrap text-muted md:table-cell">
                    {delivery.pickup.city} → {delivery.dropoff.city}
                  </td>
                  <td className="hidden px-5 py-3.5 text-muted lg:table-cell">
                    <span className="font-mono text-xs">{delivery.courier_code ?? '—'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <StatusBadge status={delivery.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {query.data && query.data.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border px-5 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, query.data.total)} of {query.data.total}
            </span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

    </>
  )
}

/* --------------------------------- Create -------------------------------- */

function readLocation(form: FormData, prefix: 'pickup' | 'dropoff'): Location {
  return {
    address: String(form.get(`${prefix}.address`) ?? '').trim(),
    city: String(form.get(`${prefix}.city`) ?? '').trim(),
    latitude: Number(form.get(`${prefix}.latitude`)),
    longitude: Number(form.get(`${prefix}.longitude`)),
  }
}

function LocationFields({
  prefix,
  title,
  errors,
  defaults,
}: {
  prefix: 'pickup' | 'dropoff'
  title: string
  errors: Record<string, string>
  defaults: { lat: string; lng: string }
}) {
  const id = (name: string) => `${prefix}.${name}`
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-4 flex items-center gap-2 text-lg font-medium tracking-tight">
        <MapPin className="size-4 text-accent" /> {title}
      </legend>
      <Field label="Address" htmlFor={id('address')} error={errors[id('address')]} className="sm:col-span-2">
        <Input id={id('address')} name={id('address')} required minLength={3} placeholder="12 Admiralty Way" />
      </Field>
      <Field label="City" htmlFor={id('city')} error={errors[id('city')]} className="sm:col-span-2">
        <Input id={id('city')} name={id('city')} required minLength={2} placeholder="Lagos" />
      </Field>
      <Field label="Latitude" htmlFor={id('latitude')} error={errors[id('latitude')]}>
        <Input
          id={id('latitude')}
          name={id('latitude')}
          type="number"
          step="any"
          min={-90}
          max={90}
          required
          defaultValue={defaults.lat}
        />
      </Field>
      <Field label="Longitude" htmlFor={id('longitude')} error={errors[id('longitude')]}>
        <Input
          id={id('longitude')}
          name={id('longitude')}
          type="number"
          step="any"
          min={-180}
          max={180}
          required
          defaultValue={defaults.lng}
        />
      </Field>
    </fieldset>
  )
}

export function NewDeliveryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (body: DeliveryCreate) => api<Delivery>('/deliveries', { method: 'POST', body }),
    onSuccess: (delivery) => {
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      queryClient.setQueryData(['delivery', delivery.id], delivery)
      toast.success('Delivery requested', { description: delivery.code })
      navigate(`/app/deliveries/${delivery.id}`)
    },
    onError: (err) => {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(err.fields)
        toast.error('Some fields need attention')
      } else {
        toast.error(errorMessage(err))
      }
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setErrors({})
    const note = String(form.get('delivery_note') ?? '').trim()
    create.mutate({
      pickup: readLocation(form, 'pickup'),
      dropoff: readLocation(form, 'dropoff'),
      recipient_name: String(form.get('recipient_name') ?? '').trim(),
      package_description: String(form.get('package_description') ?? '').trim(),
      delivery_note: note || null,
    })
  }

  return (
    <>
      <PageHeader
        title="New delivery"
        description="Where it starts, where it goes, and what you are sending."
      />
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-7">
            <LocationFields prefix="pickup" title="Pickup" errors={errors} defaults={{ lat: '6.6018', lng: '3.3515' }} />
          </Card>
          <Card className="p-6 sm:p-7">
            <LocationFields prefix="dropoff" title="Drop-off" errors={errors} defaults={{ lat: '6.4478', lng: '3.4723' }} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="space-y-4 p-6 sm:p-7">
            <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight">
              <Package className="size-4 text-accent" /> Package
            </h2>
            <Field label="Recipient name" htmlFor="recipient_name" error={errors.recipient_name}>
              <Input id="recipient_name" name="recipient_name" required minLength={2} maxLength={100} />
            </Field>
            <Field label="What is it?" htmlFor="package_description" error={errors.package_description}>
              <Input id="package_description" name="package_description" required maxLength={500} placeholder="Documents" />
            </Field>
            <Field label="Note for the courier" htmlFor="delivery_note" error={errors.delivery_note} hint="Optional.">
              <Textarea id="delivery_note" name="delivery_note" placeholder="Gate code, landmark, call on arrival…" />
            </Field>
          </Card>
          <Button type="submit" size="lg" className="w-full" loading={create.isPending}>
            Request delivery
          </Button>
        </div>
      </form>
    </>
  )
}

/* --------------------------------- Detail -------------------------------- */

const STEPS: DeliveryStatus[] = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered']

function Progress({ status }: { status: DeliveryStatus }) {
  if (status === 'cancelled') {
    return (
      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
        This delivery was cancelled. No further steps will happen.
      </p>
    )
  }
  const current = STEPS.indexOf(status)
  return (
    <ol className="grid grid-cols-5 gap-2">
      {STEPS.map((step, i) => (
        <li key={step} className="flex flex-col gap-2">
          <span className={cn('h-1 rounded-full', i <= current ? 'bg-foreground' : 'bg-surface-3')} />
          <span className={cn('text-xs', i <= current ? 'text-foreground' : 'text-subtle', i === current && 'font-medium')}>
            {STATUS_LABEL[step]}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Place({ label, location }: { label: string; location: Location }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-medium">{location.address}</p>
      <p className="text-muted">{location.city}</p>
      <p className="mt-1 font-mono text-xs text-subtle">
        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
      </p>
    </div>
  )
}

export function DeliveryDetailPage() {
  const id = Number(useParams().id)
  const { hasRole } = useAuth()

  const query = useQuery({
    queryKey: ['delivery', id],
    queryFn: ({ signal }) => api<Delivery>(`/deliveries/${id}`, { signal }),
    enabled: Number.isInteger(id),
  })

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <>
        <Card>
          {notFound ? (
            <EmptyState icon={<Package />} title="Delivery not found">
              It doesn't exist, or it isn't one you can see.
            </EmptyState>
          ) : (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          )}
        </Card>
      </>
    )
  }

  const delivery = query.data
  const canAssign = hasRole('admin') && delivery.status === 'pending'
  const canCancel = hasRole('customer', 'admin') && CANCELLABLE.includes(delivery.status)

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Delivery for {delivery.recipient_name}
          </span>
        }
        description={
          <span>
            <span className="font-mono text-sm">{delivery.code}</span>
            <span className="text-subtle"> · </span>
            Requested{' '}
            {new Date(delivery.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        }
        actions={<StatusBadge status={delivery.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-7">
            <Progress status={delivery.status} />
          </Card>
          <Card className="grid gap-6 p-6 sm:grid-cols-2 sm:p-7">
            <Place label="Pickup" location={delivery.pickup} />
            <Place label="Drop-off" location={delivery.dropoff} />
          </Card>
          <Card className="space-y-4 p-6 sm:p-7">
            <div>
              <p className="text-sm text-muted">Package</p>
              <p className="mt-1 font-medium">{delivery.package_description}</p>
            </div>
            {delivery.delivery_note && (
              <div>
                <p className="text-sm text-muted">Note for the courier</p>
                <p className="mt-1 whitespace-pre-wrap">{delivery.delivery_note}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <p className="text-sm text-muted">Courier</p>
            {delivery.courier_id ? (
              <p className="mt-1 flex items-center gap-2 font-medium">
                <Truck className="size-4" />
                {hasRole('admin') ? (
                  <Link to={`/app/couriers/${delivery.courier_id}`} className="underline underline-offset-4">
                    {delivery.courier_code}
                  </Link>
                ) : (
                  <span className="font-mono">{delivery.courier_code}</span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-muted">Not assigned yet</p>
            )}
          </Card>
          {canAssign && <AssignPanel delivery={delivery} />}
          {canCancel && <CancelPanel delivery={delivery} />}
        </div>
      </div>
    </>
  )
}

function useDeliveryUpdated() {
  const queryClient = useQueryClient()
  return (delivery: Delivery) => {
    queryClient.setQueryData(['delivery', delivery.id], delivery)
    void queryClient.invalidateQueries({ queryKey: ['deliveries'] })
    void queryClient.invalidateQueries({ queryKey: ['couriers'] })
  }
}

function AssignPanel({ delivery }: { delivery: Delivery }) {
  const updated = useDeliveryUpdated()
  const [courierId, setCourierId] = useState<number>()

  const couriers = useQuery({
    queryKey: ['couriers', 'available'],
    queryFn: ({ signal }) => api<Courier[]>('/couriers?available=true', { signal }),
  })

  const assign = useMutation({
    mutationFn: (id: number) =>
      api<Delivery>(`/deliveries/${delivery.id}/assign`, { method: 'POST', body: { courier_id: id } }),
    onSuccess: (result) => {
      updated(result)
      toast.success(`Courier ${result.courier_code} assigned`)
    },
    onError: (err) => {
      // A conflict is normal under concurrency: someone else got there first.
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message, { description: 'The list has been refreshed.' })
        setCourierId(undefined)
        void couriers.refetch()
      } else {
        toast.error(errorMessage(err))
      }
    },
  })

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium tracking-tight">Assign a courier</h2>
      <p className="mt-1 text-sm text-muted">Only available couriers are listed.</p>
      <div className="mt-4">
        {couriers.isPending ? (
          <Skeleton className="h-24" />
        ) : couriers.isError ? (
          <p className="text-sm text-red-500">{errorMessage(couriers.error)}</p>
        ) : couriers.data.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-sm text-muted">
            No courier is available right now.{' '}
            <Link to="/app/couriers/new" className="text-foreground underline underline-offset-4">
              Add one
            </Link>
          </p>
        ) : (
          <div role="radiogroup" aria-label="Available couriers" className="max-h-64 space-y-1.5 overflow-y-auto">
            {couriers.data.map((courier) => (
              <button
                key={courier.id}
                type="button"
                role="radio"
                aria-checked={courierId === courier.id}
                onClick={() => setCourierId(courier.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                  courierId === courier.id ? 'border-foreground bg-surface-2' : 'border-border hover:bg-surface-2',
                )}
              >
                <span className="font-medium">{courier.name}</span>
                <span className="font-mono text-xs text-subtle">{courier.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Button
        className="mt-4 w-full"
        disabled={courierId === undefined}
        loading={assign.isPending}
        onClick={() => courierId !== undefined && assign.mutate(courierId)}
      >
        Assign courier
      </Button>
    </Card>
  )
}

function CancelPanel({ delivery }: { delivery: Delivery }) {
  const updated = useDeliveryUpdated()
  const [confirming, setConfirming] = useState(false)

  const cancel = useMutation({
    mutationFn: () => api<Delivery>(`/deliveries/${delivery.id}/cancel`, { method: 'POST' }),
    onSuccess: (result) => {
      updated(result)
      toast.success('Delivery cancelled', { description: result.code })
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => setConfirming(false),
  })

  return (
    <Card className="p-6">
      <h2 className="text-lg font-medium tracking-tight">Cancel delivery</h2>
      <p className="mt-1 text-sm text-muted">
        Possible until pickup.{delivery.courier_id ? ' The courier is released.' : ''}
      </p>
      {confirming ? (
        <div className="mt-4 flex gap-2">
          <Button variant="danger" className="flex-1" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Yes, cancel it
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={cancel.isPending}>
            Keep
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setConfirming(true)}>
          Cancel delivery
        </Button>
      )}
    </Card>
  )
}
