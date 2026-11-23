import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Truck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Card, EmptyState, ErrorState, Pill, Skeleton } from '@/components/ui/surface'
import { api, ApiError, errorMessage } from '@/lib/api'
import type { Courier, CourierCreate } from '@/lib/types'
import { cn } from '@/lib/utils'

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Available' },
  { value: 'false', label: 'Busy' },
] as const


function Availability({ available }: { available: boolean }) {
  return available ? (
    <Pill className="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
      <span className="size-1.5 rounded-full bg-current" aria-hidden /> Available
    </Pill>
  ) : (
    <Pill className="bg-surface-3 text-muted">
      <span className="size-1.5 rounded-full bg-current" aria-hidden /> Busy
    </Pill>
  )
}

/* --------------------------------- List ---------------------------------- */

export function CouriersPage() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('available') ?? ''

  const query = useQuery({
    queryKey: ['couriers', filter || 'all'],
    queryFn: ({ signal }) => api<Courier[]>(filter ? `/couriers?available=${filter}` : '/couriers', { signal }),
  })

  return (
    <>
      <PageHeader
        title="Couriers"
        description="The fleet. A courier is busy while a delivery is assigned to them."
        actions={
          <Link to="/app/couriers/new" className={buttonVariants()}>
            <Plus /> New courier
          </Link>
        }
      />

      <div role="tablist" aria-label="Filter couriers" className="mb-5 inline-flex rounded-full bg-surface p-1">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            onClick={() => setParams(option.value ? { available: option.value } : {})}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === option.value ? 'bg-surface-3 text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl">
        {query.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState
            icon={<Truck />}
            title={filter ? 'No couriers match' : 'No couriers yet'}
            action={
              !filter && (
                <Link to="/app/couriers/new" className={buttonVariants({ size: 'sm' })}>
                  <Plus /> Add a courier
                </Link>
              )
            }
          >
            {filter ? 'Try another filter.' : 'Add couriers so deliveries can be assigned.'}
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden text-left text-xs text-subtle sm:table-header-group">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Courier</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Phone</th>
                <th className="hidden px-5 py-3 font-medium lg:table-cell">Login</th>
                <th className="px-5 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data.map((courier) => (
                <tr key={courier.id} className="relative transition-colors hover:bg-surface-2/60">
                  <td className="hidden px-5 py-3.5 font-mono text-muted sm:table-cell">#{courier.id}</td>
                  <td className="max-w-0 px-5 py-3.5">
                    <Link
                      to={`/app/couriers/${courier.id}`}
                      className="block truncate font-medium after:absolute after:inset-0 after:content-['']"
                    >
                      {courier.name}
                    </Link>
                    <p className="truncate font-mono text-muted md:hidden">{courier.phone}</p>
                  </td>
                  <td className="hidden px-5 py-3.5 font-mono text-muted md:table-cell">{courier.phone}</td>
                  <td className="hidden px-5 py-3.5 text-muted lg:table-cell">
                    {courier.user_id ? `User #${courier.user_id}` : 'Not linked'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Availability available={courier.available} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

/* --------------------------------- Create -------------------------------- */

export function NewCourierPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const create = useMutation({
    mutationFn: (body: CourierCreate) => api<Courier>('/couriers', { method: 'POST', body }),
    onSuccess: (courier) => {
      void queryClient.invalidateQueries({ queryKey: ['couriers'] })
      toast.success(`${courier.name} added to the fleet`)
      navigate(`/app/couriers/${courier.id}`)
    },
    onError: (err) => {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields)
      else toast.error(errorMessage(err))
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const userId = String(form.get('user_id') ?? '').trim()
    setErrors({})
    create.mutate({
      name: String(form.get('name') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim(),
      user_id: userId ? Number(userId) : null,
    })
  }

  return (
    <>
      <PageHeader title="New courier" />
      <Card className="max-w-xl p-6 sm:p-7">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field label="Name" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" required minLength={2} maxLength={100} autoFocus />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone} hint="10 to 20 characters, e.g. +2348012345678.">
            <Input id="phone" name="phone" type="tel" required minLength={10} maxLength={20} />
          </Field>
          <Field
            label="Linked user ID"
            htmlFor="user_id"
            error={errors.user_id}
            hint="Optional. Link the courier's login account so they can see their deliveries."
          >
            <Input id="user_id" name="user_id" type="number" min={1} />
          </Field>
          <Button type="submit" size="lg" loading={create.isPending} className="mt-2 self-start">
            Add courier
          </Button>
        </form>
      </Card>
    </>
  )
}

/* ------------------------------ Detail / edit ----------------------------- */

export function CourierDetailPage() {
  const id = Number(useParams().id)
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const query = useQuery({
    queryKey: ['courier', id],
    queryFn: ({ signal }) => api<Courier>(`/couriers/${id}`, { signal }),
    enabled: Number.isInteger(id),
  })

  const update = useMutation({
    mutationFn: (body: { name?: string; phone?: string }) =>
      api<Courier>(`/couriers/${id}`, { method: 'PATCH', body }),
    onSuccess: (courier) => {
      queryClient.setQueryData(['courier', id], courier)
      void queryClient.invalidateQueries({ queryKey: ['couriers'] })
      toast.success('Courier updated')
    },
    onError: (err) => {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields)
      else toast.error(errorMessage(err))
    },
  })

  if (query.isPending) return <Skeleton className="h-72 max-w-xl" />
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <>
        <Card>
          {notFound ? (
            <EmptyState icon={<Truck />} title="Courier not found" />
          ) : (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          )}
        </Card>
      </>
    )
  }

  const courier = query.data

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()
    // Send only what changed.
    const changes: { name?: string; phone?: string } = {}
    if (name !== courier.name) changes.name = name
    if (phone !== courier.phone) changes.phone = phone
    if (!Object.keys(changes).length) {
      toast('Nothing to save')
      return
    }
    setErrors({})
    update.mutate(changes)
  }

  return (
    <>
      <PageHeader
        title={courier.name}
        description={
          <span className="font-mono text-sm">
            Courier #{courier.id}
            {courier.user_id ? ` · user #${courier.user_id}` : ' · no linked account'}
          </span>
        }
        actions={<Availability available={courier.available} />}
      />
      <Card className="max-w-xl p-6 sm:p-7">
        {/* key resets the form when fresh data arrives */}
        <form key={`${courier.name}|${courier.phone}`} onSubmit={onSubmit} className="flex flex-col gap-5">
          <Field label="Name" htmlFor="name" error={errors.name}>
            <Input id="name" name="name" defaultValue={courier.name} required minLength={2} maxLength={100} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={courier.phone} required minLength={10} maxLength={20} />
          </Field>
          <Button type="submit" loading={update.isPending} className="mt-2 self-start">
            Save changes
          </Button>
        </form>
      </Card>
    </>
  )
}
