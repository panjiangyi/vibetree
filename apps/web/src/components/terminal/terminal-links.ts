const WEB_PROTOCOLS = new Set(['http:', 'https:'])

export function isSafeWebUrl(value: string): boolean {
  try {
    return WEB_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

export function openTerminalWebUrl(value: string): void {
  if (!isSafeWebUrl(value)) return

  const openedWindow = window.open(value, '_blank', 'noopener,noreferrer')
  if (openedWindow) openedWindow.opener = null
}
