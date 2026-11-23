/**
 * API client.
 *
 * - Every business call goes to /api/v1 (proxied to the backend by Vite).
 * - Tokens live in localStorage so all tabs share one session. A Day 2 backend
 *   change moves the refresh token into an httpOnly cookie, out of JS's reach.
 * - On a 401 the client refreshes once and retries. Refresh tokens rotate and
 *   reuse is treated as theft, so two tabs must never refresh with the same
 *   token: the refresh runs under a cross-tab lock, and a tab that finds a
 *   newer token after waiting simply uses it.
 */

import type { TokenPair } from './types'

const API_BASE = '/api/v1'
const STORE_KEY = 'veloce.session'
export const SIGNED_OUT_EVENT = 'veloce:signed-out'

interface StoredSession {
  access?: string
  refresh?: string
}

export const session = {
  get(): StoredSession {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as StoredSession
    } catch {
      return {}
    }
  },
  save(tokens: TokenPair) {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ access: tokens.access_token, refresh: tokens.refresh_token }),
      )
    } catch {
      // Storage blocked (private mode): the session lasts for this page only.
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORE_KEY)
    } catch {
      /* nothing to clear */
    }
  },
  exists(): boolean {
    return Boolean(session.get().refresh)
  },
}

/** An API failure, with the backend's stable error code and request ID. */
export class ApiError extends Error {
  status: number
  code: string
  requestId?: string
  /** Validation problems keyed by field path, e.g. "pickup.city". */
  fields: Record<string, string>

  constructor(
    status: number,
    message: string,
    code = 'error',
    requestId?: string,
    fields: Record<string, string> = {},
  ) {
    super(message)
    this.status = status
    this.code = code
    this.requestId = requestId
    this.fields = fields
  }
}

interface ErrorBody {
  error?: {
    code?: string
    message?: string
    request_id?: string
    details?: { field: string; message: string }[]
  }
}

function toApiError(status: number, body: ErrorBody | null): ApiError {
  const error = body?.error
  const fields: Record<string, string> = {}
  for (const detail of error?.details ?? []) fields[detail.field] = detail.message
  return new ApiError(
    status,
    error?.message ?? `Request failed (${status})`,
    error?.code,
    error?.request_id,
    fields,
  )
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (navigator.locks?.request) return navigator.locks.request('veloce.refresh', fn)
  return fn()
}

let refreshInFlight: Promise<boolean> | null = null

/** Get fresh tokens. `staleAccess` is the access token that just failed. */
function refreshTokens(staleAccess?: string): Promise<boolean> {
  refreshInFlight ??= withLock(async () => {
    const current = session.get()
    // Another tab (or an earlier call) already refreshed: use its result.
    if (current.access && current.access !== staleAccess) return true
    if (!current.refresh) return false

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh }),
    })
    if (!res.ok) return false
    session.save((await res.json()) as TokenPair)
    return true
  }).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

function signedOut() {
  session.clear()
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, options, true)
}

async function request<T>(path: string, options: RequestOptions, retry: boolean): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options
  const access = session.get().access
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && access) headers.Authorization = `Bearer ${access}`

  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Cannot reach the API. Is the backend running?', 'network_error')
  }

  if (res.status === 401 && auth && retry) {
    if (await refreshTokens(access)) return request<T>(path, options, false)
    signedOut()
    throw new ApiError(401, 'Your session has ended. Please sign in again.', 'unauthorized')
  }

  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw toApiError(res.status, data as ErrorBody | null)
  return data as T
}

/** Health checks live outside /api/v1. 503 still carries a useful body. */
export async function fetchReadiness(signal?: AbortSignal) {
  const res = await fetch('/health/ready', { signal })
  if (!res.ok && res.status !== 503) throw new ApiError(res.status, 'Health check failed')
  return res.json() as Promise<import('./types').Readiness>
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
