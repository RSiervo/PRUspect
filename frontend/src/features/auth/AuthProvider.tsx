import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api'
import { setTimeZone } from '@/lib/datetime'
import { queryClient } from '@/lib/queryKeys'
import { authService } from '@/services'
import type { AuthResponse, TwoFactorChallenge, User } from '@/types/api'

type Status = 'loading' | 'authenticated' | 'anonymous'

/** A sign-in either finishes, or needs a code from the authenticator app first. */
export type SignInResult = { twoFactor: false; created: boolean } | { twoFactor: true; challenge: string }

interface AuthContextValue {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<SignInResult>
  /** `created` is true when this Google sign-in created a new account. */
  loginWithGoogle: (credential: string) => Promise<SignInResult>
  verifyTwoFactor: (challenge: string, code: string) => Promise<{ recoveryCodeUsed: boolean; recoveryCodesLeft: number }>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUserState] = useState<User | null>(null)

  const setUser = useCallback((next: User) => {
    setTimeZone(next.time_zone)
    setUserState(next)
  }, [])

  const clearSession = useCallback(() => {
    setAccessToken(null)
    setUserState(null)
    setStatus('anonymous')
    queryClient.clear()
  }, [])

  // Restore the session from the HttpOnly refresh cookie on first load.
  useEffect(() => {
    let active = true
    refreshSession().then((session) => {
      if (!active) return
      if (session) {
        setUser(session.user)
        setStatus('authenticated')
      } else {
        setStatus('anonymous')
      }
    })
    return () => {
      active = false
    }
  }, [setUser])

  useEffect(() => {
    setSessionExpiredHandler(clearSession)
    return () => setSessionExpiredHandler(null)
  }, [clearSession])

  const finish = useCallback(
    (data: AuthResponse | TwoFactorChallenge): SignInResult => {
      if ('two_factor_required' in data) return { twoFactor: true, challenge: data.challenge }
      setUser(data.user)
      setStatus('authenticated')
      return { twoFactor: false, created: Boolean(data.created) }
    },
    [setUser],
  )

  const login = useCallback(async (email: string, password: string) => finish(await authService.login(email, password)), [finish])

  const loginWithGoogle = useCallback(async (credential: string) => finish(await authService.google(credential)), [finish])

  const verifyTwoFactor = useCallback(
    async (challenge: string, code: string) => {
      const data = await authService.verifyTwoFactor(challenge, code)
      setUser(data.user)
      setStatus('authenticated')
      return { recoveryCodeUsed: data.recovery_code_used, recoveryCodesLeft: data.recovery_codes_left }
    },
    [setUser],
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      clearSession()
    }
  }, [clearSession])

  const value = useMemo(
    () => ({ status, user, login, loginWithGoogle, verifyTwoFactor, logout, setUser }),
    [status, user, login, loginWithGoogle, verifyTwoFactor, logout, setUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
