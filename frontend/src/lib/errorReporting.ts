import { API_BASE_URL, getAccessToken } from '@/lib/api'

/**
 * Sends browser crashes to the server so admins get alerted.
 * Only the error type, message, stack and page path are sent — never form
 * values or page content. Limited to a few reports per page load.
 */

const MAX_REPORTS = 5
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /Load failed/i, /NetworkError when attempting/i, /Failed to fetch/i, /AbortError/i]
const sent = new Set<string>()

export function reportError(error: unknown, context?: string) {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error) ?? 'Unknown error')
    if (err.name === 'ApiError' || err.name === 'AbortError') return // the server already knows about API failures
    const message = `${context ? `${context}: ` : ''}${err.message || 'Unknown error'}`
    if (IGNORED.some((re) => re.test(message))) return
    const key = `${err.name}|${message}`
    if (sent.has(key) || sent.size >= MAX_REPORTS) return
    sent.add(key)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
    void fetch(`${API_BASE_URL}/errors/report/`, {
      method: 'POST',
      headers,
      keepalive: true,
      body: JSON.stringify({
        error_type: err.name || 'Error',
        message: message.slice(0, 2000),
        stack: (err.stack ?? '').slice(0, 20000),
        path: window.location.pathname,
      }),
    }).catch(() => undefined)
  } catch {
    // never let error reporting throw
  }
}

export function installErrorReporting() {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'Unhandled promise'))
}
