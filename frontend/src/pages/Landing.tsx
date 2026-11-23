import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/brand'
import { DeliveryStory } from '@/components/landing/DeliveryStory'
import { Reveal } from '@/components/landing/motion'
import { SiteHeader } from '@/components/layout'
import { ApiStatus } from '@/components/status'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/surface'
import { fetchReadiness } from '@/lib/api'
import { cn } from '@/lib/utils'

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

export default function Landing() {
  const { signedIn } = useAuth()
  const start = signedIn ? '/app' : '/register'

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      {/* Hero */}
      <section className={cn(container, 'flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center pb-10 text-center')}>
        <a
          href="#flow"
          className="animate-rise inline-flex items-center gap-3 rounded-full border border-border py-1.5 pr-4 pl-1.5 text-sm transition-colors hover:bg-surface"
        >
          <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-medium text-accent">New</span>
          <span className="font-medium">Readiness probes and request tracing</span>
        </a>

        <h1 className="mt-10 max-w-4xl text-[2.6rem] leading-[1.02] font-medium tracking-[-0.045em] sm:text-7xl md:text-[5.25rem]">
          <span className="animate-rise block" style={{ animationDelay: '80ms' }}>
            Dispatch that holds
          </span>
          <span className="animate-rise block" style={{ animationDelay: '180ms' }}>
            under{' '}
            <span className="relative inline-block">
              pressure
              <span className="absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-accent/70 sm:-bottom-2" aria-hidden />
            </span>
            .
          </span>
        </h1>

        <p className="animate-rise mt-7 max-w-2xl text-lg text-foreground/80 sm:text-xl" style={{ animationDelay: '300ms' }}>
          Customers request. Dispatchers assign. Couriers deliver. One platform that never double-books a courier,
          even when two dispatchers click at the same moment.
        </p>

        <div className="animate-rise mt-10 flex flex-wrap justify-center gap-3" style={{ animationDelay: '420ms' }}>
          <Link to={start} className={buttonVariants({ size: 'lg' })}>
            {signedIn ? 'Open dashboard' : 'Start shipping'}
            <ChevronRight />
          </Link>
          <a href="/docs" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            View API docs
          </a>
        </div>

        <a href="#flow" className="animate-rise mt-16 flex flex-col items-center gap-2 text-sm text-subtle" style={{ animationDelay: '700ms' }}>
          Scroll to follow a delivery
          <span className="animate-bob block h-6 w-px bg-subtle" aria-hidden />
        </a>
      </section>

      {/* Scroll story */}
      <div id="flow">
        <DeliveryStory />
      </div>

      {/* Under pressure */}
      <section id="reliability" className={cn(container, 'py-24 sm:py-32')}>
        <Reveal>
          <SectionTitle eyebrow="Under pressure" title="Two dispatchers. One courier." />
          <p className="mt-5 max-w-2xl text-lg text-muted">
            The race every dispatch system eventually meets. Veloce answers it with row locks taken in a fixed order,
            so one request wins and the other gets a clear conflict.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
          <Reveal>
            <TerminalCard />
          </Reveal>
          <Reveal delay={120}>
            <LiveSystemCard />
          </Reveal>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className={cn(container, 'py-24 sm:py-32')}>
        <Reveal>
          <SectionTitle eyebrow="Roles" title="One platform, three views." />
        </Reveal>
        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          <Reveal>
            <Role name="Customers" lines={['Request a delivery in one form.', 'See only their own deliveries.', 'Cancel any time before pickup.']} />
          </Reveal>
          <Reveal delay={100}>
            <Role name="Couriers" lines={['See the jobs assigned to them.', 'Nothing else: other jobs stay hidden.', 'Pickup and drop-off at a glance.']} />
          </Reveal>
          <Reveal delay={200}>
            <Role name="Admins" lines={['See every delivery.', 'Assign available couriers.', 'Run the fleet.']} />
          </Reveal>
        </div>
      </section>

      {/* Principles */}
      <section className={cn(container, 'py-24 sm:py-32')}>
        <Reveal>
          <SectionTitle eyebrow="Built for the bad day" title="Correct first. Fast second." />
        </Reveal>
        <div className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2">
          {PRINCIPLES.map((item, i) => (
            <Reveal key={item.title} delay={(i % 2) * 100}>
              <div className="border-t border-border pt-6">
                <span className="font-mono text-sm text-accent">0{i + 1}</span>
                <h3 className="mt-3 text-2xl font-medium tracking-[-0.03em]">{item.title}</h3>
                <p className="mt-3 max-w-md leading-relaxed text-muted">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className={cn(container, 'py-28 text-center sm:py-36')}>
        <Reveal>
          <h2 className="text-4xl font-medium tracking-[-0.045em] sm:text-7xl">Ready when you are.</h2>
          <p className="mx-auto mt-5 max-w-lg text-lg text-muted">
            Create an account and request your first delivery in under a minute.
          </p>
          <Link to={start} className={buttonVariants({ size: 'lg', className: 'mt-10' })}>
            Get started
            <ChevronRight />
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-border">
        <div className={cn(container, 'flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between')}>
          <Logo />
          <ApiStatus />
          <nav className="flex gap-6 text-sm text-muted">
            <a href="/docs" className="hover:text-foreground">API docs</a>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
            <Link to="/register" className="hover:text-foreground">Create account</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

const PRINCIPLES = [
  {
    title: 'Locks before writes',
    body: 'Assignment locks the delivery, then the courier, always in that order. Simultaneous requests queue up instead of overwriting each other.',
  },
  {
    title: 'Sessions that rotate',
    body: 'Every refresh token works exactly once. A replayed token ends the whole session, so a stolen copy is worth nothing.',
  },
  {
    title: 'Every request traceable',
    body: 'Each response carries a request ID that appears on every log line it produced. One search finds the whole story.',
  },
  {
    title: 'Honest health checks',
    body: 'Liveness and readiness are separate. A database outage stops traffic without restarting a perfectly healthy process.',
  },
]

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
      <h2 className="mt-4 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">{title}</h2>
    </div>
  )
}

function Role({ name, lines }: { name: string; lines: string[] }) {
  return (
    <div className="border-t border-foreground/80 pt-6">
      <h3 className="text-3xl font-medium tracking-[-0.03em]">{name}</h3>
      <ul className="mt-5 space-y-3 text-[17px] text-muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

function Line({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('whitespace-pre', className)}>{children}</p>
}

function TerminalCard() {
  return (
    <Card className="flex h-full min-h-80 flex-col overflow-hidden font-mono text-[13px]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-subtle">veloce/dispatch</span>
      </div>
      <div className="overflow-x-auto px-4 py-4 leading-relaxed">
        <Line className="text-subtle"># two dispatchers, one courier, same moment</Line>
        <Line>
          <span className="text-emerald-500">POST</span> /api/v1/deliveries/41/assign <span className="text-emerald-500">200</span>
        </Line>
        <Line>
          <span className="text-emerald-500">POST</span> /api/v1/deliveries/42/assign <span className="text-amber-500">409</span>
        </Line>
        <Line className="text-subtle">  └ "Courier 7 not available"</Line>
        <Line className="mt-3 text-subtle"># what the database saw</Line>
        <Line>SELECT … FROM deliveries WHERE id = 41 FOR UPDATE</Line>
        <Line>SELECT … FROM couriers   WHERE id = 7  FOR UPDATE</Line>
        <Line className="text-subtle">  … the second request waits, then finds the courier busy</Line>
        <Line className="mt-3">
          <span className="text-emerald-500">✓</span> 1 courier, 1 active assignment
        </Line>
      </div>
    </Card>
  )
}

/** Real data: polls the backend's readiness endpoint. */
function LiveSystemCard() {
  const { data, isError } = useQuery({
    queryKey: ['readiness'],
    queryFn: ({ signal }) => fetchReadiness(signal),
    refetchInterval: 15_000,
    retry: false,
  })

  const checks = data ? Object.entries(data.checks) : []
  const ready = data?.status === 'ready'

  return (
    <Card className="flex h-full min-h-80 flex-col p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">This system, right now</span>
        <span className="flex items-center gap-1.5 font-mono text-xs text-subtle">
          <span className="animate-pulse-dot size-1.5 rounded-full bg-accent" aria-hidden />
          LIVE
        </span>
      </div>
      <p className="mt-6 text-5xl font-medium tracking-[-0.045em]">
        {isError ? 'Offline' : !data ? '…' : ready ? 'Ready' : 'Degraded'}
      </p>
      <p className="mt-2 text-sm text-muted">
        {isError ? 'Start the backend to see live checks.' : 'Read from /health/ready every 15 seconds.'}
      </p>
      <div className="mt-auto space-y-2 pt-6">
        {checks.map(([name, check]) => (
          <div key={name} className="flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
            <span className="flex items-center gap-2 capitalize">
              <span className={cn('size-2 rounded-full', check.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden />
              {name}
            </span>
            <span className="font-mono text-xs text-subtle">
              {check.status === 'ok' ? `${check.latency_ms} ms` : check.error}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
