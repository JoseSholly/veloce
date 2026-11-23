import { useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/layout'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, Pill } from '@/components/ui/surface'
import { errorMessage } from '@/lib/api'
import type { UserRole } from '@/lib/types'

const ROLE_DESCRIPTION: Record<UserRole, string> = {
  customer: 'Can request deliveries and see their own.',
  courier: 'Can see the deliveries assigned to them.',
  admin: 'Can see every delivery, assign couriers and manage the fleet.',
}

export function ProfilePage() {
  const { user, logout, logoutAll } = useAuth()
  const navigate = useNavigate()

  // Leave the protected page first: if the session ended while we were still
  // here, the route guard would send us to the sign-in page instead of home.
  const signOut = useMutation({
    mutationFn: async () => {
      navigate('/', { replace: true })
      await logout()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const signOutEverywhere = useMutation({
    mutationFn: async () => {
      navigate('/', { replace: true })
      await logoutAll()
    },
    onSuccess: () => toast.success('Signed out on every device'),
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (!user) return null

  return (
    <>
      <PageHeader title="Profile" description="Your account details and active sessions." />

      <div className="max-w-3xl space-y-6">
        {/* Identity */}
        <Card className="flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-center">
          <Avatar name={user.full_name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-medium tracking-tight">{user.full_name}</h2>
            <p className="truncate text-muted">{user.email}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Pill className="bg-surface-2 capitalize">{user.role}</Pill>
              {user.is_active ? (
                <Pill className="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-current" aria-hidden /> Active
                </Pill>
              ) : (
                <Pill className="bg-red-500/10 text-red-500">Disabled</Pill>
              )}
            </div>
          </div>
        </Card>

        {/* Details */}
        <Section title="Personal information" description="Details are set when the account is created.">
          <dl className="divide-y divide-border">
            <Row label="Full name">{user.full_name}</Row>
            <Row label="Email address">{user.email}</Row>
            <Row label="Role">
              <span className="capitalize">{user.role}</span>
              <span className="mt-0.5 block text-sm text-muted">{ROLE_DESCRIPTION[user.role]}</span>
            </Row>
            <Row label="User ID">
              <span className="font-mono">{user.id}</span>
            </Row>
          </dl>
        </Section>

        {/* Security */}
        <Section title="Security" description="Manage where you are signed in.">
          <div className="divide-y divide-border">
            <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">This device</p>
                <p className="text-sm text-muted">End the session in this browser.</p>
              </div>
              <Button variant="secondary" size="sm" loading={signOut.isPending} onClick={() => signOut.mutate()}>
                Sign out
              </Button>
            </div>
            <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">All devices</p>
                <p className="max-w-md text-sm text-muted">
                  End every session, everywhere. Tokens already issued stop working within 15 minutes.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={signOutEverywhere.isPending}
                onClick={() => signOutEverywhere.mutate()}
              >
                Sign out everywhere
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="border-b border-border px-6 py-4">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {children}
    </Card>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-6 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
