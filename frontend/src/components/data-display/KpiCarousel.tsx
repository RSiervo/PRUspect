import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Phone layout for KPI tiles: swipeable pages (CSS scroll-snap) with line
 * indicators that show the current page and jump to a page when tapped.
 */
export function KpiCarousel({ pages, label = 'Key figures' }: { pages: ReactNode[][]; label?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const el = track.current
    if (!el) return
    const onScroll = () => {
      const index = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1))
      setPage(Math.min(pages.length - 1, Math.max(0, index)))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [pages.length])

  const goTo = (index: number) => {
    const el = track.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: index * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
    setPage(index)
  }

  return (
    <section aria-roledescription="carousel" aria-label={label}>
      <div
        ref={track}
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((cards, index) => (
          <div
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${pages.length}`}
            aria-hidden={index !== page}
            className="grid w-full shrink-0 snap-center grid-cols-2 gap-3 px-4"
          >
            {cards}
          </div>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {pages.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show key figures ${index + 1} of ${pages.length}`}
              aria-current={index === page ? 'true' : undefined}
              className="grid h-6 place-items-center px-0.5"
            >
              <span
                className={cn(
                  'block h-1 rounded-full transition-all duration-300',
                  index === page ? 'w-6 bg-brand-600' : 'w-3 bg-ink-200',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
