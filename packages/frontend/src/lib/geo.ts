/**
 * Validates whether a given string is a safe, secure HTTPS Google Maps link.
 * Rejects non-HTTPS schemes, javascript:, data:, and non-Google hostnames.
 */
export function isValidGoogleMapsUrl(urlString?: string | null): boolean {
  if (!urlString || typeof urlString !== 'string') return false
  const trimmed = urlString.trim()
  if (!trimmed) return false

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return false

    const host = parsed.hostname.toLowerCase()
    const pathname = parsed.pathname

    // Supported Google Maps host patterns:
    if (host === 'maps.google.com') return true
    if (host === 'maps.app.goo.gl') return true
    if (host === 'goo.gl' && (pathname.startsWith('/maps') || pathname.length > 1)) return true

    if (/^maps\.google\.(com?\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2,3})$/.test(host)) {
      return true
    }

    if (pathname.startsWith('/maps')) {
      if (host === 'www.google.com' || host === 'google.com') return true
      if (/^(www\.)?google\.(com?\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2,3})$/.test(host)) {
        return true
      }
    }

    return false
  } catch {
    return false
  }
}
