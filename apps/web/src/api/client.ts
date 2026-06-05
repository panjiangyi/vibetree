const configuredApiBase = import.meta.env.VITE_API_BASE?.trim()

export function getApiBase(): string {
  return configuredApiBase || ''
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Request failed')
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json()
}
