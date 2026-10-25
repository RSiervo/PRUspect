import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api, setAccessToken, setSessionExpiredHandler } from '@/lib/api'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  setAccessToken(null)
  setSessionExpiredHandler(null)
})

describe('api client', () => {
  it('sends the in-memory access token and the anti-CSRF header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }))
    setAccessToken('abc')
    await api.get('/prospects/', { page: 2, status: ['won', 'lost'], empty: '' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/prospects/?page=2&status=won%2Clost')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer abc')
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    setAccessToken('expired')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { detail: 'expired', code: 'token_not_valid', errors: {} }))
      .mockResolvedValueOnce(json(200, { access: 'fresh', user: { id: 1 } }))
      .mockResolvedValueOnce(json(200, { value: 42 }))
    const result = await api.get<{ value: number }>('/dashboard/summary/')
    expect(result.value).toBe(42)
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/auth/refresh/')
    const retryHeaders = (fetchMock.mock.calls[2]![1] as RequestInit).headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe('Bearer fresh')
  })

  it('signals session expiry when the refresh fails', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { detail: 'expired', code: 'x', errors: {} }))
      .mockResolvedValueOnce(json(401, { detail: 'no session', code: 'x', errors: {} }))
    await expect(api.get('/prospects/')).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledOnce()
  })

  it('exposes field errors from validation responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(400, { detail: 'Please correct the highlighted fields.', code: 'validation_error', errors: { mobile: ['Enter a valid phone number.'] } }),
    )
    const error = (await api.post('/prospects/', {}).catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(400)
    expect(error.fieldErrors.mobile).toEqual(['Enter a valid phone number.'])
  })

  it('reports network failures with a friendly message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.get('/prospects/')).rejects.toThrow(/Cannot reach the server/)
  })
})
