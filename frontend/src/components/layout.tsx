import { LayoutDashboard, LogOut, Menu, Package, Truck, User, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/ThemeToggle'
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

/* ------------------------------ App shell -------------------------------- */

const NAV: { to: string; label: string; icon: typeof Package; roles?: UserRole[]; end?: boolean }[] = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/deliveries', label: 'Deliveries', icon: Package },
  { to: '/app/couriers', label: 'Couriers', icon: Truck, roles: ['admin'] },
  { to: '/app/account', label: 'Account', icon: User },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

function SidebarContent({ user, onSignOut }: { user: UserType; onSignOut: () => void }) {
  const links = NAV.filter((item) => !item.roles || item.roles.includes(user.role))
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex flex-col gap-0.5 px-3 pt-2" aria-label="Main">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                isActive ? 'bg-surface-2 text-foreground' : 'text-muted hover:bg-surface-2/60 hover:text-foreground',
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background">
            {initials(user.full_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.full_name}</p>
            <p className="truncate text-xs text-muted capitalize">{user.role}</p>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <ThemeToggle withLabel />
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

/** The signed-in frame: a sidebar on large screens, a drawer on phones. */
export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The drawer counts as open only on the page where it was opened, so
  // following a link closes it without an extra effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const drawerOpen = openedOn === location.pathname
  const setDrawerOpen = (open: boolean) => setOpenedOn(open ? location.pathname : null)

  // While the drawer is open: Escape closes it and the page behind does not scroll.
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface/50 lg:block">
        <SidebarContent user={user} onSignOut={signOut} />
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <Menu />
        </button>
      </header>

      {/* Phone drawer */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', drawerOpen ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!drawerOpen}>
        <div
          className={cn('absolute inset-0 bg-black/40 transition-opacity duration-300', drawerOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setDrawerOpen(false)}
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
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'absolute top-3.5 right-3')}
          >
            <X />
          </button>
          <SidebarContent user={user} onSignOut={signOut} />
        </div>
      </div>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

/* ------------------------------ Route guards ----------------------------- */

/** Only signed-in users (optionally with one of `roles`) see the children. */
export function RequireAuth({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
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
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** A page title row with optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-3xl font-medium tracking-[-0.03em] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
