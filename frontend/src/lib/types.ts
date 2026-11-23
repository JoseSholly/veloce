// Mirrors the backend's Pydantic schemas (backend/app/schemas). Keep in step.

export type UserRole = 'customer' | 'courier' | 'admin'

export interface User {
  id: number
  email: string
  full_name: string
  is_active: boolean
  role: UserRole
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
  courier_id: number | null
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
  name: string
  phone: string
  available: boolean
  user_id: number | null
}

export interface CourierCreate {
  name: string
  phone: string
  user_id?: number | null
}

export interface Readiness {
  status: 'ready' | 'not_ready'
  checks: Record<string, { status: 'ok' | 'error'; latency_ms?: number; error?: string }>
}
