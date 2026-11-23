import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

import { api, session, SIGNED_OUT_EVENT } from '@/lib/api'
import type { TokenPair, User, UserRole } from '@/lib/types'

interface AuthContextValue {
  user: User | undefined
  /** True until we know whether a stored session is still valid. */
  loading: boolean
  /** Set when the stored session could not be checked (e.g. the API is down). */
  error: Error | null
  retry: () => void
  signedIn: boolean
  login: (email: string, password: string) => Promise<User>
  register: (data: { email: string; full_name: string; password: string }) => Promise<User>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  hasRole: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [hasSession, setHasSession] = useState(() => session.exists())

  const me = useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api<User>('/auth/me', { signal }),
    enabled: hasSession,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const reset = useCallback(() => {
    session.clear()
    setHasSession(false)
    queryClient.clear()
  }, [queryClient])

  // The API client signals when a refresh fails; another tab may sign out too.
  useEffect(() => {
    const onSignedOut = () => reset()
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'veloce.session' && !session.exists()) reset()
    }
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
      window.removeEventListener('storage', onStorage)
    }
  }, [reset])

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api<TokenPair>('/auth/login/json', {
        method: 'POST',
        body: { email, password },
        auth: false,
      })
      session.save(tokens)
      const user = await api<User>('/auth/me')
      queryClient.setQueryData(['me'], user)
      setHasSession(true)
      return user
    },
    [queryClient],
  )

  const register = useCallback(
    async (data: { email: string; full_name: string; password: string }) => {
      await api<User>('/auth/register', { method: 'POST', body: data, auth: false })
      return login(data.email, data.password)
    },
    [login],
  )

  const logout = useCallback(async () => {
    const refresh = session.get().refresh
    try {
      if (refresh) {
        await api('/auth/logout', { method: 'POST', body: { refresh_token: refresh }, auth: false })
      }
    } finally {
      reset()
    }
  }, [reset])

  const logoutAll = useCallback(async () => {
    try {
      await api('/auth/logout-all', { method: 'POST' })
    } finally {
      reset()
    }
  }, [reset])

  const user = hasSession ? me.data : undefined
  const value: AuthContextValue = {
    user,
    loading: hasSession && me.isPending,
    error: hasSession ? me.error : null,
    retry: () => void me.refetch(),
    signedIn: Boolean(user),
    login,
    register,
    logout,
    logoutAll,
    hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
