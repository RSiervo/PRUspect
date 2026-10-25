import { RotateCw, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/errorReporting'

/** Shown instead of a blank screen when a page crashes. The error is reported to admins. */
export function RouteError() {
  const error = useRouteError()
  const isChunkError = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message)

  useEffect(() => {
    if (isRouteErrorResponse(error)) return
    if (isChunkError) {
      // A new version was deployed while the page was open: reload once to get it.
      if (!sessionStorage.getItem('pruspect-chunk-reload')) {
        sessionStorage.setItem('pruspect-chunk-reload', '1')
        window.location.reload()
      }
      return
    }
    reportError(error, 'Page crashed')
  }, [error, isChunkError])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <TriangleAlert className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-600">
          This page hit an unexpected problem. It’s been reported automatically. Your saved data is safe.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCw /> Reload
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/" reloadDocument>Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
