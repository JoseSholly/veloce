import { useMutation } from '@tanstack/react-query'
import { LogOut, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/layout'
import { ApiStatus, RoleBadge } from '@/components/status'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/surface'
import { errorMessage } from '@/lib/api'

export function AccountPage() {
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

  const rows: [string, ReactNode][] = [
    ['Name', user.full_name],
    ['Email', user.email],
    ['Role', <RoleBadge key="role" role={user.role} />],
    ['User ID', <span key="id" className="font-mono">{user.id}</span>],
    ['Status', user.is_active ? 'Active' : 'Disabled'],
  ]

  return (
    <>
      <PageHeader title="Account" description="Your profile, sessions and preferences." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6 sm:p-7">
          <h2 className="text-lg font-medium tracking-tight">Profile</h2>
          <dl className="mt-5 divide-y divide-border">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-3 text-[15px]">
                <dt className="text-muted">{label}</dt>
                <dd className="truncate text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-6">
          <Card className="p-6 sm:p-7">
            <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight">
              <ShieldCheck className="size-4" /> Sessions
            </h2>
            <p className="mt-2 text-sm text-muted">
              Signing out everywhere ends every session on every device. Tokens already issued stop working within
              15 minutes.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" loading={signOut.isPending} onClick={() => signOut.mutate()}>
                <LogOut /> Sign out
              </Button>
              <Button variant="outline" loading={signOutEverywhere.isPending} onClick={() => signOutEverywhere.mutate()}>
                Sign out everywhere
              </Button>
            </div>
          </Card>

          <Card className="flex items-center justify-between gap-4 p-6 sm:p-7">
            <div>
              <h2 className="text-lg font-medium tracking-tight">Appearance</h2>
              <p className="mt-1 text-sm text-muted">Starts from your device setting until you pick one.</p>
            </div>
            <ThemeToggle withLabel />
          </Card>

          <Card className="flex items-center justify-between gap-4 p-6 sm:p-7">
            <h2 className="text-lg font-medium tracking-tight">API</h2>
            <ApiStatus />
          </Card>
        </div>
      </div>
    </>
  )
}
