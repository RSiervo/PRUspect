import type { ApiErrorBody, AuthResponse } from '@/types/api'

/**
 * Fetch wrapper for the Django API.
 *
 * - The short-lived access token lives only in memory (never localStorage).
 * - The refresh token is an HttpOnly cookie the browser sends to /api/v1/auth/.
 * - On a 401 we refresh once (shared across concurrent requests) and retry.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1'

let accessToken: string | null = null
let refreshPromise: Promise<AuthResponse | null> | null = null
let onSessionExpired: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

export class ApiError extends Error {
  status: number
  code: string
  fieldErrors: Record<string, string[]>
  body: ApiErrorBody | null

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.detail || fallback)
    this.name = 'ApiError'
    this.status = status
    this.code = body?.code || 'error'
    this.body = body
    this.fieldErrors = {}
    for (const [field, value] of Object.entries(body?.errors ?? {})) {
      if (Array.isArray(value)) this.fieldErrors[field] = value
      else this.fieldErrors[field] = Object.values(value).flat()
    }
  }
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>

export function buildQuery(params?: Query): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','))
    } else {
      search.set(key, String(value))
    }
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    body = null
  }
  const fallback =
    response.status >= 500
      ? 'The server had a problem. Please try again.'
      : response.status === 404
        ? 'That record was not found.'
        : `Request failed (${response.status}).`
  return new ApiError(response.status, body, fallback)
}

export async function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(async (response) => {
        if (!response.ok) return null
        const data = (await response.json()) as AuthResponse
        accessToken = data.access
        return data
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Query
  signal?: AbortSignal
  raw?: boolean
  auth?: boolean
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken && options.auth !== false) headers.Authorization = `Bearer ${accessToken}`
  return fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    signal: options.signal,
  })
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await send(path, options)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, null, 'Cannot reach the server. Check your connection and try again.')
  }

  if (response.status === 401 && options.auth !== false) {
    const refreshed = await refreshSession()
    if (refreshed) {
      response = await send(path, options)
    } else {
      onSessionExpired?.()
    }
  }

  if (!response.ok) throw await parseError(response)
  if (options.raw) return response as unknown as T
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
}

/** Download a CSV (or other file) from an authenticated endpoint. */
export async function downloadFile(path: string, query?: Query): Promise<void> {
  const response = await request<Response>(path, { query, raw: true })
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = match?.[1] ?? 'export.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
