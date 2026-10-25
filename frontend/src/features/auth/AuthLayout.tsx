import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { Logo, Mountains } from '@/components/layout/Logo'

/** Shared frame for the sign-in and sign-up screens. */
export function AuthLayout({ mobileTitle, mobileSubtitle, children }: { mobileTitle: string; mobileSubtitle: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.22),transparent_45%)]" />
        <div className="relative flex h-full flex-col p-12 text-white">
          <Logo inverted />
          <div className="mt-auto mb-56 max-w-md">
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              Your goals.
              <br />
              Your clients’ priority.
            </h1>
            <p className="mt-4 text-base text-white/80">
              Manage your prospects, keep every follow-up on time, and see your pipeline at a glance.
            </p>
          </div>
        </div>
        <Mountains className="absolute inset-x-0 bottom-0 h-56 w-full" />
      </div>

      <div className="flex flex-col">
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-800 px-6 pt-10 pb-20 text-white lg:hidden">
          <Logo inverted />
          <h1 className="mt-8 text-2xl font-bold">{mobileTitle}</h1>
          <p className="mt-1 text-sm text-white/80">{mobileSubtitle}</p>
          <Mountains className="absolute inset-x-0 bottom-0 h-20 w-full" />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:px-6 lg:items-center">
          <motion.div
            className="card relative z-10 -mt-16 w-full max-w-sm p-6 sm:p-8 lg:mt-0"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </div>
        <p className="pb-6 text-center text-xs text-ink-400">Secure · Private · Always with you</p>
      </div>
    </div>
  )
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ink-400" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}
