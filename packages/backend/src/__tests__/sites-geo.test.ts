import { request, createTestOrg, createTestClient, authHeader } from './helpers';
import { prisma } from '../lib/prisma';
import { isValidGoogleMapsUrl } from '../utils/geo';

describe('Projects, Sites & Google Maps Location Security Audit', () => {
  let testOrg: Awaited<ReturnType<typeof createTestOrg>>;
  let clientId: string;

  beforeAll(async () => {
    testOrg = await createTestOrg('geo');
    const client = await createTestClient(testOrg.orgId, {
      nameAr: 'شركة الرواد للاستثمار',
      nameEn: 'Al-Rowad Investment',
    });
    clientId = client.id;
  });

  describe('1. isValidGoogleMapsUrl Validator', () => {
    it('accepts valid HTTPS Google Maps URLs (desktop, mobile app, shortlink)', () => {
      expect(isValidGoogleMapsUrl('https://maps.google.com/?q=26.4207,50.0888')).toBe(true);
      expect(isValidGoogleMapsUrl('https://www.google.com/maps/place/Dammam+Saudi+Arabia')).toBe(true);
      expect(isValidGoogleMapsUrl('https://maps.app.goo.gl/vNx5d7KjXyZa1234')).toBe(true);
      expect(isValidGoogleMapsUrl('https://goo.gl/maps/abcXYZ123')).toBe(true);
      expect(isValidGoogleMapsUrl('https://maps.google.com.sa/maps?q=Al-Khobar')).toBe(true);
    });

    it('rejects insecure HTTP Google Maps URLs', () => {
      expect(isValidGoogleMapsUrl('http://maps.google.com/?q=26.4207,50.0888')).toBe(false);
      expect(isValidGoogleMapsUrl('http://maps.app.goo.gl/vNx5d7KjXyZa1234')).toBe(false);
    });

    it('rejects non-Google or malicious phishing URLs', () => {
      expect(isValidGoogleMapsUrl('https://evil-maps.com/?q=test')).toBe(false);
      expect(isValidGoogleMapsUrl('https://maps.google.com.fake.com/maps')).toBe(false);
      expect(isValidGoogleMapsUrl('https://attacker.site/maps.google.com')).toBe(false);
      expect(isValidGoogleMapsUrl('javascript:alert(1)')).toBe(false);
      expect(isValidGoogleMapsUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('handles null, undefined, empty and whitespace strings safely', () => {
      expect(isValidGoogleMapsUrl('')).toBe(false);
      expect(isValidGoogleMapsUrl('   ')).toBe(false);
      expect(isValidGoogleMapsUrl(null)).toBe(false);
      expect(isValidGoogleMapsUrl(undefined)).toBe(false);
    });
  });

  describe('2. Sites API Integration with Google Maps URLs', () => {
    let createdSiteId: string;

    it('creates a site successfully with a valid Google Maps URL', async () => {
      const res = await request
        .post('/api/sites')
        .set(authHeader(testOrg.accessToken))
        .send({
          clientId,
          nameAr: 'مشروع برج الأمل - الدمام',
          nameEn: 'Al-Amal Tower Project',
          address: 'طريق الملك فهد، حي الشاطئ، الدمام',
          googleMapsUrl: 'https://maps.google.com/?q=26.4344,50.1033',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameAr).toBe('مشروع برج الأمل - الدمام');
      expect(res.body.data.googleMapsUrl).toBe('https://maps.google.com/?q=26.4344,50.1033');
      createdSiteId = res.body.data.id;
    });

    it('rejects creating a site with an invalid or malicious Google Maps URL (400)', async () => {
      const res = await request
        .post('/api/sites')
        .set(authHeader(testOrg.accessToken))
        .send({
          clientId,
          nameAr: 'موقع غير صالح',
          googleMapsUrl: 'https://malicious-site.com/exploit',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.message || res.body.error).toContain('Invalid Google Maps URL');
    });

    it('updates site and preserves or updates the Google Maps URL', async () => {
      const updatedUrl = 'https://maps.app.goo.gl/vNx5d7KjXyZa1234';
      const res = await request
        .put(`/api/sites/${createdSiteId}`)
        .set(authHeader(testOrg.accessToken))
        .send({
          googleMapsUrl: updatedUrl,
          notes: 'تم تحديث الإحداثيات الدقيقة للموقع',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.googleMapsUrl).toBe(updatedUrl);
      expect(res.body.data.notes).toBe('تم تحديث الإحداثيات الدقيقة للموقع');
    });

    it('allows clearing the Google Maps URL by passing an empty string or null', async () => {
      const res = await request
        .put(`/api/sites/${createdSiteId}`)
        .set(authHeader(testOrg.accessToken))
        .send({
          googleMapsUrl: '',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.googleMapsUrl).toBeNull();
    });

    it('preserves other site and client data when updating unrelated fields', async () => {
      const res = await request
        .put(`/api/sites/${createdSiteId}`)
        .set(authHeader(testOrg.accessToken))
        .send({
          nameAr: 'مشروع برج الأمل - الدمام (المرحلة المتقدمة)',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.nameAr).toBe('مشروع برج الأمل - الدمام (المرحلة المتقدمة)');
      expect(res.body.data.clientId).toBe(clientId);
    });
  });
});
