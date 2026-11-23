import { createBrowserRouter, RouterProvider } from 'react-router'

import { AppShell, RequireAuth } from '@/components/layout'
import { AccountPage } from '@/pages/app/Account'
import { CourierDetailPage, CouriersPage, NewCourierPage } from '@/pages/app/Couriers'
import { DeliveriesPage, DeliveryDetailPage, NewDeliveryPage } from '@/pages/app/Deliveries'
import { OverviewPage } from '@/pages/app/Overview'
import { LoginPage, RegisterPage } from '@/pages/Auth'
import Landing from '@/pages/Landing'
import NotFound from '@/pages/NotFound'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
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
      { path: 'account', element: <AccountPage /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
