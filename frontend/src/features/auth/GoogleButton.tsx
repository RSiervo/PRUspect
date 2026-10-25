import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { authService } from '@/services'

/** Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client). */
interface GoogleId {
  initialize: (options: {
    client_id: string
    callback: (response: { credential?: string }) => void
    context?: 'signin' | 'signup' | 'use'
    ux_mode?: 'popup' | 'redirect'
    itp_support?: boolean
    use_fedcm_for_prompt?: boolean
  }) => void
  renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void
  cancel: () => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client'
let scriptPromise: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error('Could not load Google sign-in. Check your connection or ad blocker.'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/** Which sign-in methods the server offers (Google appears only when configured). */
export function useAuthConfig() {
  return useQuery({ queryKey: ['auth-config'], queryFn: authService.config, staleTime: 10 * 60_000, retry: 1 })
}

interface GoogleButtonProps {
  clientId: string
  mode: 'signin' | 'signup'
  onCredential: (credential: string) => void
  onError?: (message: string) => void
}

/**
 * Google's official "Sign in with Google" button. Google returns a signed ID token
 * that the API verifies; we never handle the user's Google password.
 */
export function GoogleButton({ clientId, mode, onCredential, onError }: GoogleButtonProps) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  const [failed, setFailed] = useState<string | null>(null)
  callback.current = onCredential

  useEffect(() => {
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        const id = window.google?.accounts.id
        if (cancelled || !id || !container.current) return
        id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) callback.current(response.credential)
            else onError?.('Google sign-in was cancelled.')
          },
          context: mode === 'signup' ? 'signup' : 'signin',
          ux_mode: 'popup',
          itp_support: true,
        })
        const width = Math.min(400, Math.max(220, Math.floor(container.current.clientWidth)))
        container.current.innerHTML = ''
        id.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: mode === 'signup' ? 'signup_with' : 'continue_with',
          logo_alignment: 'left',
          width,
        })
      })
      .catch((error: Error) => {
        if (cancelled) return
        setFailed(error.message)
        onError?.(error.message)
      })
    return () => {
      cancelled = true
      window.google?.accounts.id.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, mode])

  if (failed) return <p className="text-center text-xs text-ink-500">{failed}</p>
  return <div ref={container} className="flex min-h-11 w-full justify-center" data-testid="google-button" />
}
