import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KpiCarousel } from '@/components/data-display/KpiCarousel'
import { InstallAppDialog } from '@/features/install/InstallApp'

afterEach(() => vi.unstubAllGlobals())

describe('KPI carousel (phones)', () => {
  const cards = Array.from({ length: 8 }, (_, i) => <div key={i}>KPI {i + 1}</div>)

  it('splits tiles into two pages of four with line indicators', () => {
    render(<KpiCarousel pages={[cards.slice(0, 4), cards.slice(4)]} />)
    const slides = screen.getAllByRole('group', { hidden: true })
    expect(slides).toHaveLength(2)
    expect(within(slides[0]!).getAllByText(/KPI/)).toHaveLength(4)
    expect(within(slides[1]!).getByText('KPI 8')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show key figures 1 of 2' })).toHaveAttribute('aria-current', 'true')
  })

  it('switches page when a line is tapped', async () => {
    const scrollTo = vi.fn()
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo
    render(<KpiCarousel pages={[cards.slice(0, 4), cards.slice(4)]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show key figures 2 of 2' }))
    expect(scrollTo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Show key figures 2 of 2' })).toHaveAttribute('aria-current', 'true')
  })
})

describe('Install app dialog', () => {
  it('shows Add to Home Screen steps on iPhone', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', maxTouchPoints: 5 })
    render(<InstallAppDialog open onOpenChange={() => {}} />)
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Install$/ })).not.toBeInTheDocument()
  })

  it('offers one-tap install when the browser allows it', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) })
    window.dispatchEvent(event)
    const onOpenChange = vi.fn()
    render(<InstallAppDialog open onOpenChange={onOpenChange} />)
    await userEvent.click(await screen.findByRole('button', { name: /^Install$/ }))
    expect(prompt).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
