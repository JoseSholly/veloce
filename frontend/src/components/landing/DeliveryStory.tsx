import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

import { clamp01, easeInOut, lerp } from '@/lib/easing'

import { useScrollProgress } from './motion'

/*
 * A pinned, scroll-driven story: one delivery from request to doorstep.
 * The section is several screens tall; its inner frame sticks to the viewport
 * while scroll progress (0..1) moves the delivery through five steps.
 */

const STEPS = [
  {
    status: 'Pending',
    title: 'A customer asks for a pickup.',
    body: 'Pickup in Ikeja, drop-off in Lekki. The delivery is created as pending, and only the customer who asked for it can see it.',
    event: 'Delivery requested',
    time: '09:12',
  },
  {
    status: 'Assigned',
    title: 'A dispatcher locks in a courier.',
    body: 'The delivery is locked, then the courier. If a second dispatcher reaches for the same courier at the same moment, they get a clean conflict, never a double booking.',
    event: 'Assigned to Ada',
    time: '09:14',
  },
  {
    status: 'Picked up',
    title: 'The parcel changes hands.',
    body: 'Ada reaches the pickup point and collects the parcel. From here on, cancelling is no longer possible.',
    event: 'Picked up in Ikeja',
    time: '09:31',
  },
  {
    status: 'In transit',
    title: 'Across the city.',
    body: 'The route unfolds street by street. Every step is recorded, so nobody has to ask where the parcel is.',
    event: 'In transit',
    time: '09:33',
  },
  {
    status: 'Delivered',
    title: 'Handed over.',
    body: 'The recipient signs, the courier is free for the next job, and the full history stays on record.',
    event: 'Delivered in Lekki',
    time: '09:58',
  },
] as const

// Map geometry (SVG units, viewBox 0 0 600 600).
const DEPOT = { x: 470, y: 520 }
const PICKUP = { x: 110, y: 455 }
const DROPOFF = { x: 490, y: 130 }
const SAMPLES = 200

/** Interpolates between the sampled route points at fraction `t` (0..1). */
function pointAlong(points: { x: number; y: number }[], t: number) {
  const exact = t * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(exact))
  const f = exact - i
  return { x: lerp(points[i].x, points[i + 1].x, f), y: lerp(points[i].y, points[i + 1].y, f) }
}

const ROUTE = 'M110 455 C 170 455, 190 380, 240 350 S 330 330, 360 270 S 420 150, 490 130'

export function DeliveryStory() {
  const sectionRef = useRef<HTMLElement>(null)
  const routeRef = useRef<SVGPathElement>(null)
  // Measured once after mount: the route's length and evenly spaced points
  // along it, so render never has to touch the DOM.
  const [route, setRoute] = useState<{ length: number; points: { x: number; y: number }[] }>({
    length: 0,
    points: [],
  })
  const progress = useScrollProgress(sectionRef)

  useLayoutEffect(() => {
    const path = routeRef.current
    if (!path) return
    const length = path.getTotalLength()
    const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const point = path.getPointAtLength((length * i) / SAMPLES)
      return { x: point.x, y: point.y }
    })
    setRoute({ length, points })
  }, [])
  const routeLength = route.length

  // Leave a little room at the end so "Delivered" stays on screen before unpinning.
  const position = Math.min(progress * 1.08, 0.9999) * STEPS.length
  const step = Math.floor(position)
  const t = easeInOut(clamp01(position - step))

  // Where the courier is, and how much of the route has been driven.
  let courier = DEPOT
  let driven = 0
  if (step === 1) courier = { x: lerp(DEPOT.x, PICKUP.x, t), y: lerp(DEPOT.y, PICKUP.y, t) }
  if (step >= 2) courier = PICKUP
  if (step === 3) driven = t
  if (step >= 4) driven = 1
  if (driven > 0 && route.points.length) courier = pointAlong(route.points, driven)

  return (
    <section ref={sectionRef} aria-label="How a delivery moves through Veloce" style={{ height: '520vh' }}>
      <div className="sticky top-0 flex h-dvh items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          {/* Text: on large screens every step is listed; on phones only the current one. */}
          <div className="order-2 lg:order-1">
            <p className="font-mono text-xs tracking-[0.2em] text-accent uppercase">One delivery, end to end</p>

            <div className="mt-5 flex gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span key={s.status} className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full bg-foreground"
                    style={{ width: `${i < step ? 100 : i === step ? clamp01(position - step) * 100 : 0}%` }}
                  />
                </span>
              ))}
            </div>

            <ol className="mt-8 hidden space-y-1 lg:block">
              {STEPS.map((s, i) => (
                <li key={s.status} className="grid grid-cols-[2.5rem_1fr] gap-x-2">
                  <span
                    className={cn(
                      'pt-1.5 font-mono text-sm transition-colors duration-500',
                      i === step ? 'text-accent' : 'text-subtle',
                    )}
                  >
                    0{i + 1}
                  </span>
                  <div>
                    <h3
                      className={cn(
                        'text-2xl font-medium tracking-[-0.03em] transition-colors duration-500',
                        i === step ? 'text-foreground' : 'text-subtle/70',
                      )}
                    >
                      {s.title}
                    </h3>
                    <div
                      className={cn(
                        'grid transition-[grid-template-rows,opacity] duration-500',
                        i === step ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                      )}
                    >
                      <p className="overflow-hidden pt-2 pb-4 text-[17px] leading-relaxed text-muted">{s.body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 lg:hidden" aria-live="polite">
              <p className="font-mono text-sm text-accent">0{step + 1}</p>
              <h3 key={step} className="animate-rise mt-1 text-2xl font-medium tracking-[-0.03em]">
                {STEPS[step].title}
              </h3>
              <p key={`b${step}`} className="animate-rise mt-2 leading-relaxed text-muted">
                {STEPS[step].body}
              </p>
            </div>
          </div>

          {/* The map */}
          <div className="relative order-1 h-[46dvh] overflow-hidden rounded-3xl border border-border bg-surface lg:order-2 lg:h-[min(78dvh,640px)]">
            <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
              <defs>
                <pattern id="story-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M30 0H0V30" fill="none" stroke="currentColor" strokeOpacity="0.05" />
                </pattern>
              </defs>
              <rect width="600" height="600" fill="url(#story-grid)" className="text-foreground" />

              {/* Streets */}
              <g className="text-foreground" stroke="currentColor" strokeOpacity="0.08" strokeWidth="14" fill="none" strokeLinecap="round">
                <path d="M-20 455 L620 440" />
                <path d="M-20 300 L620 330" />
                <path d="M-20 130 L620 120" />
                <path d="M110 -20 L130 620" />
                <path d="M360 -20 L340 620" />
                <path d="M490 -20 L500 620" />
              </g>
              {/* Lagoon */}
              <path
                d="M-20 560 C 120 520, 260 600, 380 560 S 560 590, 620 560 L620 620 L-20 620 Z"
                className="fill-sky-500/10"
              />

              {/* The planned route (faint), then the driven part (accent) */}
              <path
                ref={routeRef}
                d={ROUTE}
                fill="none"
                stroke="currentColor"
                strokeOpacity={step >= 1 ? 0.25 : 0}
                strokeWidth="2"
                strokeDasharray="4 8"
                className="text-foreground transition-[stroke-opacity] duration-700"
              />
              {routeLength > 0 && (
                <path
                  d={ROUTE}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={routeLength}
                  strokeDashoffset={routeLength * (1 - driven)}
                />
              )}

              {/* Pickup and drop-off */}
              <g className="text-foreground">
                <circle cx={PICKUP.x} cy={PICKUP.y} r="9" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
                <circle
                  cx={DROPOFF.x}
                  cy={DROPOFF.y}
                  r="9"
                  fill={step >= 4 ? 'var(--accent)' : 'var(--surface)'}
                  stroke={step >= 4 ? 'var(--accent)' : 'currentColor'}
                  strokeWidth="3"
                  className="transition-[fill,stroke] duration-500"
                />
              </g>

              {/* Courier */}
              <g
                style={{ transform: `translate(${courier.x}px, ${courier.y}px)` }}
                className={cn('transition-opacity duration-500', step === 0 ? 'opacity-40' : 'opacity-100')}
              >
                <circle r="22" fill="var(--accent)" opacity="0.15" className={step === 2 ? 'animate-ping-slow' : ''} />
                <circle r="8" fill="var(--accent)" stroke="var(--surface)" strokeWidth="3" />
              </g>
            </svg>

            {/* Place labels */}
            <span className="absolute right-4 bottom-4 hidden rounded-full sm:block bg-background/80 px-3 py-1 text-xs font-medium backdrop-blur">
              Ikeja → Lekki
            </span>

            {/* Delivery card */}
            <div className="absolute right-3 bottom-3 left-3 rounded-2xl border border-border bg-background/90 p-3.5 backdrop-blur sm:top-4 sm:right-auto sm:bottom-auto sm:left-4 sm:w-72 sm:p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-subtle">Delivery #1042</span>
                <span
                  key={step}
                  className={cn(
                    'animate-rise rounded-full px-2.5 py-0.5 text-xs font-medium',
                    step >= 4 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-accent/12 text-accent',
                  )}
                >
                  {STEPS[step].status}
                </span>
              </div>
              <ol className="mt-3 space-y-1.5 text-sm">
                {STEPS.slice(0, step + 1).map((s, i) => (
                  <li
                    key={s.event}
                    className={cn(
                      'animate-rise flex items-center gap-3',
                      // Phones: only the latest event, so the card stays small.
                      i < step && 'hidden sm:flex',
                    )}
                  >
                    <span className="w-11 font-mono text-xs text-subtle">{s.time}</span>
                    <span className={i === step ? 'text-foreground' : 'text-muted'}>{s.event}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
