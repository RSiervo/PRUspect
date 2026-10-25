import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api'
import { setTimeZone } from '@/lib/datetime'
import { queryClient } from '@/lib/queryKeys'
import { authService } from '@/services'
import type { User } from '@/types/api'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<void>
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

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authService.login(email, password)
      setUser(data.user)
      setStatus('authenticated')
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

  const value = useMemo(() => ({ status, user, login, logout, setUser }), [status, user, login, logout, setUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
