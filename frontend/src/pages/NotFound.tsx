import { Link } from 'react-router'

import { SiteHeader } from '@/components/layout'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 pt-32 text-center">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-4 text-5xl font-medium tracking-[-0.04em]">Off the map.</h1>
        <p className="mt-4 text-lg text-muted">This page doesn't exist.</p>
        <Link to="/" className={buttonVariants({ size: 'lg', className: 'mt-10' })}>
          Back home
        </Link>
      </main>
    </div>
  )
}
