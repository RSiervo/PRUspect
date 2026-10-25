import { useEffect, useState, useSyncExternalStore } from 'react'

/** Chrome/Edge/Android fire this when the app can be installed with one tap. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // we show our own Install button instead of the browser's mini-bar
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** Register the service worker (production builds only). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installing is optional; the app works normally without the worker.
    })
  })
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS reports itself as Mac; touch support tells them apart.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export type InstallState = 'installed' | 'available' | 'ios' | 'unsupported'

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current install option for this device and a function to trigger it. */
export function useInstallApp() {
  const hasPrompt = useSyncExternalStore(subscribe, () => deferredPrompt !== null, () => false)
  const [standalone, setStandalone] = useState(isStandalone)

  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)')
    const update = () => setStandalone(isStandalone())
    media?.addEventListener?.('change', update)
    window.addEventListener('appinstalled', update)
    return () => {
      media?.removeEventListener?.('change', update)
      window.removeEventListener('appinstalled', update)
    }
  }, [])

  const state: InstallState = standalone ? 'installed' : hasPrompt ? 'available' : isIos() ? 'ios' : 'unsupported'

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false
    const event = deferredPrompt
    await event.prompt()
    const { outcome } = await event.userChoice
    deferredPrompt = null
    notify()
    return outcome === 'accepted'
  }

  return { state, install }
}
