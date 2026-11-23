import { ChevronDown, ChevronRight, LayoutDashboard, LogOut, Menu, Package, Truck, User, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/brand'
import { ApiStatus } from '@/components/status'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState, Skeleton } from '@/components/ui/surface'
import { errorMessage } from '@/lib/api'
import type { User as UserType, UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

/* ----------------------------- Public header ----------------------------- */

export function SiteHeader() {
  const { signedIn } = useAuth()

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md">
      <div className={cn(container, 'flex h-16 items-center gap-8')}>
        <Logo />
        <nav className="hidden items-center gap-7 text-[15px] font-medium md:flex">
          <a href="/#flow" className="text-foreground/75 hover:text-foreground">How it works</a>
          <a href="/#reliability" className="text-foreground/75 hover:text-foreground">Reliability</a>
          <a href="/#roles" className="text-foreground/75 hover:text-foreground">Roles</a>
          <a href="/docs" className="text-foreground/75 hover:text-foreground">API</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link to="/app" className={buttonVariants({ size: 'sm' })}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Sign in
              </Link>
              <Link to="/register" className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

/* ------------------------------ Navigation ------------------------------- */

interface NavItem {
  to: string
  label: string
  icon: typeof Package
  roles?: UserRole[]
  end?: boolean
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/app/deliveries', label: 'Deliveries', icon: Package },
      { to: '/app/couriers', label: 'Couriers', icon: Truck, roles: ['admin'] },
    ],
  },
  {
    label: 'Account',
    items: [{ to: '/app/profile', label: 'Profile', icon: User }],
  },
]

/**
 * Reads a query's cached data and re-renders when it changes, without ever
 * fetching. (A useQuery here would need its own fetch function, and could
 * replace the page's one on the next refetch.)
 */
function useCachedData<T>(queryKey: unknown[] | null): T | undefined {
  const queryClient = useQueryClient()
  return useSyncExternalStore(
    (onChange) => queryClient.getQueryCache().subscribe(onChange),
    () => (queryKey ? queryClient.getQueryData<T>(queryKey) : undefined),
  )
}

/**
 * Breadcrumb trail for the current path, e.g. Deliveries › VEL-DEL-….
 * Addresses carry internal ids; the last crumb shows the record's public code,
 * read from the data the page has already loaded (no extra request).
 */
function useBreadcrumbs(): { label: string; to?: string }[] {
  const { pathname } = useLocation()
  const parts = pathname.replace(/^\/app\/?/, '').split('/').filter(Boolean)
  const section: Record<string, string> = { deliveries: 'Deliveries', couriers: 'Couriers', profile: 'Profile' }
  const detailKey = { deliveries: 'delivery', couriers: 'courier' }[parts[0] as 'deliveries' | 'couriers']
  const id = Number(parts[1])

  const detail = useCachedData<{ code?: string }>(detailKey && Number.isInteger(id) ? [detailKey, id] : null)

  if (parts.length === 0) return [{ label: 'Overview' }]
  const crumbs: { label: string; to?: string }[] = [
    { label: section[parts[0]] ?? parts[0], to: parts.length > 1 ? `/app/${parts[0]}` : undefined },
  ]
  if (parts[1] === 'new') crumbs.push({ label: 'New' })
  else if (parts[1]) crumbs.push({ label: detail?.code ?? 'Details' })
  return crumbs
}

function Sidebar({ user }: { user: UserType }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pt-4" aria-label="Main">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.roles || item.roles.includes(user.role))
          if (!items.length) return null
          return (
            <div key={group.label}>
              <p className="px-3 pb-2 text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">{group.label}</p>
              <div className="space-y-0.5">
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] font-medium transition-colors',
                        isActive ? 'bg-surface-2 text-foreground' : 'text-muted hover:bg-surface-2/60 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-[17px]" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-border px-5 py-4">
        <ApiStatus className="text-xs" />
      </div>
    </div>
  )
}

/** Avatar button with a small menu: profile and sign out. */
function UserMenu({ user, onSignOut }: { user: UserType; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-surface-2"
      >
        <Avatar name={user.full_name} size="sm" />
        <span className="hidden max-w-36 truncate text-sm font-medium sm:block">{user.full_name}</span>
        <ChevronDown className="hidden size-3.5 text-subtle sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-rise absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-background shadow-xl shadow-black/10 [animation-duration:200ms]"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium">{user.full_name}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
          <div className="p-1.5">
            <Link
              to="/app/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2"
            >
              <User className="size-4 text-muted" /> Profile
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
            >
              <LogOut className="size-4 text-muted" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The signed-in frame: sidebar, top bar with breadcrumbs, and the page. */
export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const crumbs = useBreadcrumbs()

  // The drawer counts as open only on the page where it was opened, so
  // following a link closes it without an extra effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const drawerOpen = openedOn === location.pathname

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpenedOn(null)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  if (!user) return null

  // Go home before the session ends, so the route guard does not redirect to sign-in.
  const signOut = () => {
    navigate('/', { replace: true })
    void logout()
  }

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-surface/40 lg:block">
        <Sidebar user={user} />
      </aside>

      {/* Phone drawer */}
      <div className={cn('fixed inset-0 z-50 lg:hidden', !drawerOpen && 'pointer-events-none')} aria-hidden={!drawerOpen}>
        <div
          className={cn('absolute inset-0 bg-black/40 transition-opacity duration-300', drawerOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setOpenedOn(null)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-background shadow-2xl transition-transform duration-300 ease-out',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            onClick={() => setOpenedOn(null)}
            aria-label="Close menu"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'absolute top-3.5 right-3')}
          >
            <X />
          </button>
          <Sidebar user={user} />
        </div>
      </div>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setOpenedOn(location.pathname)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), '-ml-2 lg:hidden')}
          >
            <Menu />
          </button>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            {crumbs.map((crumb, i) => (
              <Fragment key={crumb.label}>
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle" />}
                {crumb.to ? (
                  <Link to={crumb.to} className="truncate text-muted hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu user={user} onSignOut={signOut} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ------------------------------ Route guards ----------------------------- */

/**
 * Only signed-in users (optionally with one of `roles`) see the children.
 * Accounts still on a temporary password are sent to choose their own first,
 * unless the page is the one where they do that (`allowPasswordChange`).
 */
export function RequireAuth({
  roles,
  allowPasswordChange = false,
  children,
}: {
  roles?: UserRole[]
  allowPasswordChange?: boolean
  children: ReactNode
}) {
  const { user, loading, error, retry } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className={cn(container, 'space-y-4 py-24')}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!user && error) return <ErrorState message={errorMessage(error)} onRetry={retry} />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (user.must_change_password && !allowPasswordChange) return <Navigate to="/password" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** A page title row with optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
