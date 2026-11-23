import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'

import { AppShell, RequireAuth } from '@/components/layout'
import { CourierDetailPage, CouriersPage, NewCourierPage } from '@/pages/app/Couriers'
import { DeliveriesPage, DeliveryDetailPage, NewDeliveryPage } from '@/pages/app/Deliveries'
import { OverviewPage } from '@/pages/app/Overview'
import { ProfilePage } from '@/pages/app/Profile'
import { LoginPage, PasswordPage, RegisterPage } from '@/pages/Auth'
import Landing from '@/pages/Landing'
import NotFound from '@/pages/NotFound'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/password',
    element: (
      <RequireAuth allowPasswordChange>
        <PasswordPage />
      </RequireAuth>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'deliveries', element: <DeliveriesPage /> },
      {
        path: 'deliveries/new',
        element: (
          <RequireAuth roles={['customer', 'admin']}>
            <NewDeliveryPage />
          </RequireAuth>
        ),
      },
      { path: 'deliveries/:id', element: <DeliveryDetailPage /> },
      {
        path: 'couriers',
        element: (
          <RequireAuth roles={['admin']}>
            <CouriersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'couriers/new',
        element: (
          <RequireAuth roles={['admin']}>
            <NewCourierPage />
          </RequireAuth>
        ),
      },
      {
        path: 'couriers/:id',
        element: (
          <RequireAuth roles={['admin']}>
            <CourierDetailPage />
          </RequireAuth>
        ),
      },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'account', element: <Navigate to="/app/profile" replace /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
