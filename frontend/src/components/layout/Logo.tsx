import { useId } from 'react'

import { cn } from '@/lib/utils'

/** Neutral PRUspect mark (a "P" with a forward dot). Not an official company logo. */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  // Unique per instance: a gradient defined inside a hidden copy (e.g. the desktop sidebar) won't render elsewhere.
  const gradId = `pruspect-grad-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9', className)} aria-hidden>
      <rect width="32" height="32" rx="10" fill={inverted ? '#ffffff' : `url(#${gradId})`} />
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="#e83552" />
          <stop offset="1" stopColor="#a80d27" />
        </linearGradient>
      </defs>
      <path
        d="M11 23V9h6.2c3 0 5 1.9 5 4.6s-2 4.6-5 4.6H14.4V23z"
        fill="none"
        stroke={inverted ? '#c8102e' : '#fff'}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="22.5" r="2.4" fill={inverted ? '#c8102e' : '#fff'} />
    </svg>
  )
}

export function Logo({ className, inverted, subtitle = 'Prospect Management' }: { className?: string; inverted?: boolean; subtitle?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark inverted={inverted} />
      <div className="leading-tight">
        <p className={cn('text-[15px] font-bold tracking-tight', inverted ? 'text-white' : 'text-ink-900')}>
          PRU<span className={inverted ? 'text-white/85' : 'text-brand-600'}>spect</span>
        </p>
        {subtitle && <p className={cn('text-[11px]', inverted ? 'text-white/75' : 'text-ink-500')}>{subtitle}</p>}
      </div>
    </div>
  )
}

/** Decorative mountain illustration used on the login screen and sidebar card. */
export function Mountains({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`m-back-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={`m-front-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7e0b1f" />
          <stop offset="1" stopColor="#4a0512" />
        </linearGradient>
      </defs>
      <path d="M0 120 L60 80 L105 102 L170 40 L230 95 L280 62 L340 100 L400 70 L400 160 L0 160 Z" fill={`url(#m-back-${uid})`} />
      <path d="M0 140 L70 100 L120 122 L190 70 L215 86 L250 64 L320 118 L360 104 L400 124 L400 160 L0 160 Z" fill={`url(#m-front-${uid})`} />
      <path d="M190 70 L203 79 L196 80 L215 86 L208 78 Z" fill="#ffffff" fillOpacity="0.55" />
      <path d="M250 64 L262 74 L255 74 L268 80 Z" fill="#ffffff" fillOpacity="0.45" />
    </svg>
  )
}
