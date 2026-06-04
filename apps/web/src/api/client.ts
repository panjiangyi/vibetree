const configuredApiBase = import.meta.env.VITE_API_BASE

export function getApiBase(): string {
  return localStorage.getItem('vibetree.apiBase') ?? configuredApiBase ?? window.location.origin
}

export function getDefaultApiBase(): string {
  return configuredApiBase ?? window.location.origin
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
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? 'Request failed')
  }

  return res.json()
}
