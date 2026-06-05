export function normalizeAbsoluteRequestUrl(url: string): string {
  if (!/^(https?|wss?):\/\//i.test(url)) {
    return url
  }

  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}
