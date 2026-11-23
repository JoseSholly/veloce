import { Check, Eye, EyeOff } from 'lucide-react'
import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { useAuth } from '@/auth/AuthProvider'
import { Logo } from '@/components/brand'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { ApiError, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Only follow same-app redirects, never an absolute URL from the query string. */
function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/app'
}

/* ------------------------------- Layout ---------------------------------- */

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <BrandPanel />
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">{children}</main>
      </div>
    </div>
  )
}

// Points of the decorative network, in percent of the panel.
const NODES: [number, number, 'a' | 'b'][] = [
  [57, 6, 'a'], [46, 9, 'b'], [62, 11, 'a'], [52, 14, 'b'], [45, 13, 'a'],
  [9, 21, 'b'], [22, 20, 'b'], [27, 21, 'a'], [9, 27, 'a'],
  [66, 44, 'b'], [72, 43, 'a'], [69, 51, 'b'], [64, 58, 'a'], [73, 58, 'b'],
  [49, 58, 'a'], [52, 71, 'b'], [62, 77, 'b'], [70, 67, 'a'],
  [90, 41, 'b'], [88, 49, 'a'], [53, 96, 'b'], [58, 95, 'a'], [69, 98, 'b'],
]
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [3, 2], [1, 4], [3, 4], [5, 6], [6, 7], [5, 8],
  [9, 10], [9, 11], [11, 12], [12, 13], [11, 13], [14, 15], [15, 16], [16, 17], [17, 13],
  [18, 19], [20, 21], [21, 22],
]

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-border bg-gradient-to-br from-sky-50 via-white to-orange-50 lg:flex lg:flex-col dark:from-[#0c141c] dark:via-[#0a0a0a] dark:to-[#1c120a]">
      {/* Drifting network of points */}
      <svg className="animate-drift absolute inset-0 size-full" aria-hidden>
        {EDGES.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={`${NODES[a][0]}%`}
            y1={`${NODES[a][1]}%`}
            x2={`${NODES[b][0]}%`}
            y2={`${NODES[b][1]}%`}
            className="stroke-sky-500/25 dark:stroke-sky-400/20"
            strokeWidth="1"
          />
        ))}
        {NODES.map(([x, y, kind], i) => (
          <circle
            key={i}
            cx={`${x}%`}
            cy={`${y}%`}
            r={kind === 'a' ? 3.5 : 3}
            className={kind === 'a' ? 'fill-orange-400/80' : 'fill-sky-500/70 dark:fill-sky-400/70'}
          />
        ))}
      </svg>

      <div className="relative flex flex-1 flex-col px-14 py-12">
        <Logo />
        <div className="my-auto max-w-xl py-16">
          <h1 className="text-[2.75rem] leading-[1.08] font-medium tracking-[-0.04em] xl:text-5xl">
            Dispatch built for how deliveries <span className="text-accent">actually move.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            Requests, couriers and assignments in one place, correct even when everyone clicks at once.
          </p>
          <ul className="mt-10 space-y-4 text-[17px]">
            {['Courier assignment that never double-books', 'Every delivery visible to exactly the right people', 'Sessions that rotate and detect replays'].map(
              (item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>
        <p className="font-mono text-sm text-subtle">veloce · delivery &amp; dispatch</p>
      </div>
    </aside>
  )
}

function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div>
      <p className="font-mono text-xs font-medium tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.04em]">{title}</h1>
      <p className="mt-3 text-muted">{subtitle}</p>
    </div>
  )
}

/* ------------------------------- Fields ---------------------------------- */

const inputClass =
  'h-12 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-subtle transition-colors focus:border-foreground/40 focus:outline-none aria-[invalid=true]:border-red-500'

function AuthField({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const isPassword = props.type === 'password'

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-medium tracking-[0.12em] text-muted uppercase">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          {...props}
          type={isPassword && visible ? 'text' : props.type}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          className={cn(inputClass, isPassword && 'pr-12')}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-subtle hover:text-foreground"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-note`} className={cn('text-sm', error ? 'text-red-500' : 'text-subtle')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}

const submitClass = 'h-12 w-full rounded-xl text-[15px]'

/* -------------------------------- Pages ---------------------------------- */

export function LoginPage() {
  const { login, signedIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  if (signedIn) return <Navigate to={next} replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(undefined)
    try {
      await login(String(form.get('email')), String(form.get('password')))
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <Heading eyebrow="Dashboard access" title="Welcome back" subtitle="Sign in to your Veloce dashboard." />
      <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-6">
        <AuthField label="Email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required autoFocus />
        <AuthField label="Password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
        <FormError message={error} />
        <Button type="submit" loading={pending} className={submitClass}>
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-muted">
        New to Veloce?{' '}
        <Link to="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { register, signedIn } = useAuth()
  const navigate = useNavigate()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  if (signedIn) return <Navigate to="/app" replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(undefined)
    setFields({})
    try {
      const user = await register({
        full_name: String(form.get('full_name')).trim(),
        email: String(form.get('email')).trim(),
        password: String(form.get('password')),
      })
      toast.success(`Welcome to Veloce, ${user.full_name.split(' ')[0]}`)
      navigate('/app', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields)
      else setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <Heading eyebrow="Get started" title="Create your account" subtitle="Request your first delivery in under a minute." />
      <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-6">
        <AuthField
          label="Full name"
          name="full_name"
          autoComplete="name"
          placeholder="Ada Obi"
          required
          minLength={2}
          maxLength={100}
          autoFocus
          error={fields.full_name}
        />
        <AuthField label="Email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required error={fields.email} />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          maxLength={128}
          error={fields.password}
        />
        <FormError message={error} />
        <Button type="submit" loading={pending} className={submitClass}>
          Create account
        </Button>
        <p className="-mt-2 text-sm text-subtle">New accounts are customers. An admin can grant other roles.</p>
      </form>
      <p className="mt-8 text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

/* ---------------------------- Choose password ---------------------------- */

/**
 * Two cases, one page: a courier replacing the temporary password an admin
 * gave them (they cannot use the app until they do), or anyone changing theirs.
 */
export function PasswordPage() {
  const { user, changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const firstTime = Boolean(user?.must_change_password)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const current = String(form.get('current_password'))
    const next = String(form.get('new_password'))
    setError(undefined)
    setFields({})
    if (next !== String(form.get('confirm_password'))) {
      setFields({ confirm_password: 'The passwords do not match' })
      return
    }
    setPending(true)
    try {
      await changePassword(current, next)
      toast.success(firstTime ? 'Password set. Welcome to Veloce.' : 'Password changed')
      navigate('/app', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields)
      else setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <Heading
        eyebrow={firstTime ? 'One more step' : 'Security'}
        title={firstTime ? 'Choose your password' : 'Change password'}
        subtitle={
          firstTime
            ? 'You signed in with a temporary password. Replace it with one only you know.'
            : 'Every other session ends when you change it.'
        }
      />
      <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-6">
        <AuthField
          label={firstTime ? 'Temporary password' : 'Current password'}
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          error={fields.current_password}
        />
        <AuthField
          label="New password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          maxLength={128}
          error={fields.new_password}
        />
        <AuthField
          label="Confirm new password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          error={fields.confirm_password}
        />
        <FormError message={error} />
        <Button type="submit" loading={pending} className={submitClass}>
          {firstTime ? 'Set password and continue' : 'Change password'}
        </Button>
      </form>
      <p className="mt-8 text-muted">
        {firstTime ? (
          <>
            Not you?{' '}
            <button
              type="button"
              onClick={() => {
                navigate('/', { replace: true })
                void logout()
              }}
              className="font-medium text-accent hover:underline"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/app/profile" className="font-medium text-accent hover:underline">
            Back to profile
          </Link>
        )}
      </p>
    </AuthLayout>
  )
}
