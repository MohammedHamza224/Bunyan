import { describe, it, expect } from 'vitest'
import { isValidGoogleMapsUrl } from '../lib/geo'

describe('Google Maps URL Security & Formatting (Frontend)', () => {
  it('accepts valid HTTPS Google Maps URLs in all supported formats', () => {
    expect(isValidGoogleMapsUrl('https://maps.google.com/?q=26.4207,50.0888')).toBe(true)
    expect(isValidGoogleMapsUrl('https://www.google.com/maps/place/Dammam')).toBe(true)
    expect(isValidGoogleMapsUrl('https://maps.app.goo.gl/vNx5d7KjXyZa1234')).toBe(true)
    expect(isValidGoogleMapsUrl('https://goo.gl/maps/abcXYZ123')).toBe(true)
    expect(isValidGoogleMapsUrl('https://maps.google.com.sa/maps?q=Al-Khobar')).toBe(true)
  })

  it('rejects insecure HTTP Google Maps URLs', () => {
    expect(isValidGoogleMapsUrl('http://maps.google.com/?q=26.4207,50.0888')).toBe(false)
    expect(isValidGoogleMapsUrl('http://maps.app.goo.gl/vNx5d7KjXyZa1234')).toBe(false)
  })

  it('rejects domain spoofing, phishing, and non-Google URLs', () => {
    expect(isValidGoogleMapsUrl('https://evil-maps.com/?q=test')).toBe(false)
    expect(isValidGoogleMapsUrl('https://maps.google.com.fake.com/maps')).toBe(false)
    expect(isValidGoogleMapsUrl('https://attacker.site/maps.google.com')).toBe(false)
    expect(isValidGoogleMapsUrl('javascript:alert(1)')).toBe(false)
    expect(isValidGoogleMapsUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('handles empty, null, and undefined values safely without crashing', () => {
    expect(isValidGoogleMapsUrl('')).toBe(false)
    expect(isValidGoogleMapsUrl('   ')).toBe(false)
    expect(isValidGoogleMapsUrl(null)).toBe(false)
    expect(isValidGoogleMapsUrl(undefined)).toBe(false)
  })
})
