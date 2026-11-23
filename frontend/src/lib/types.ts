// Mirrors the backend's Pydantic schemas (backend/app/schemas). Keep in step.
// `id` is only for addresses and API calls. Show `code` to people, never `id`.

export type UserRole = 'customer' | 'courier' | 'admin'

export interface User {
  id: number
  code: string
  email: string
  full_name: string
  is_active: boolean
  role: UserRole
  must_change_password: boolean
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'

export interface Location {
  address: string
  city: string
  latitude: number
  longitude: number
}

export interface Delivery {
  id: number
  code: string
  courier_id: number | null
  courier_code: string | null
  created_at: string
  pickup: Location
  dropoff: Location
  recipient_name: string
  package_description: string
  delivery_note: string | null
  status: DeliveryStatus
}

export interface DeliveryCreate {
  pickup: Location
  dropoff: Location
  recipient_name: string
  package_description: string
  delivery_note?: string | null
}

export interface DeliveryList {
  items: Delivery[]
  page: number
  page_size: number
  total: number
}

export interface Courier {
  id: number
  code: string
  name: string
  email: string
  phone: string
  available: boolean
}

export interface CourierCreate {
  name: string
  email: string
  phone: string
}

/** Returned once, when an admin onboards a courier. */
export interface CourierCreated extends Courier {
  temporary_password: string
}

export interface Readiness {
  status: 'ready' | 'not_ready'
  checks: Record<string, { status: 'ok' | 'error'; latency_ms?: number; error?: string }>
}
