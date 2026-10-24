/**
 * Google Maps URL Validator & Security Sanitizer
 * Accepts only trusted, secure HTTPS Google Maps link formats.
 * Rejects non-HTTPS schemes, javascript:, data:, and third-party hostnames.
 */
export function isValidGoogleMapsUrl(urlString?: string | null): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // Supported Google Maps host patterns:
    // 1. maps.google.com
    if (host === 'maps.google.com') return true;
    // 2. Mobile share shortlinks: maps.app.goo.gl or goo.gl/maps
    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl' && (pathname.startsWith('/maps') || pathname.length > 1)) return true;

    // 3. Google international ccTLDs for maps: maps.google.com.sa, maps.google.co.uk, maps.google.ae
    if (/^maps\.google\.(com?\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2,3})$/.test(host)) {
      return true;
    }

    // 4. Main Google web domains with /maps path: google.com/maps, www.google.com/maps, google.com.sa/maps
    if (pathname.startsWith('/maps')) {
      if (host === 'www.google.com' || host === 'google.com') return true;
      if (/^(www\.)?google\.(com?\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2,3})$/.test(host)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
