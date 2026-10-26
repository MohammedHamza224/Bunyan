import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '../i18n';
import { AuthProvider } from '../store/authStore';
import { AppLayout } from '../components/layout/AppLayout';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { ProfessionalTaxInvoice } from '../components/invoices/ProfessionalTaxInvoice';

describe('Company Logo Upload & Statements Translation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    const createMockStorage = () => {
      const store = new Map<string, string>();
      return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      };
    };

    if (typeof (globalThis as any).window === 'undefined') {
      ;(globalThis as any).window = {
        localStorage: createMockStorage(),
        sessionStorage: createMockStorage(),
        location: { pathname: '/settings', href: '' },
      };
    } else {
      window.localStorage?.clear?.();
      window.sessionStorage?.clear?.();
    }
  });

  describe('Task 2: Statements Translation Consistency', () => {
    it('translates nav.statements and statements.title to "Statements" in English', async () => {
      await i18n.changeLanguage('en');
      expect(i18n.t('nav.statements')).toBe('Statements');
      expect(i18n.t('statements.title')).toBe('Statements');
      expect(i18n.t('statements.createStatement')).toBe('Create Statement');
    });

    it('translates nav.statements and statements.title to "كشوف الحسابات" in Arabic', async () => {
      await i18n.changeLanguage('ar');
      expect(i18n.t('nav.statements')).toBe('كشوف الحسابات');
      expect(i18n.t('statements.title')).toBe('كشوف الحسابات');
    });

    it('renders "Statements" in English sidebar navigation', async () => {
      await i18n.changeLanguage('en');
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/statements']}>
              <AppLayout />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('Statements');
      expect(html).toContain('/statements');
    });

    it('renders "كشوف الحسابات" in Arabic sidebar navigation', async () => {
      await i18n.changeLanguage('ar');
      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/statements']}>
              <AppLayout />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(html).toContain('كشوف الحسابات');
      expect(html).toContain('/statements');
    });
  });

  describe('Task 1: Company Logo File Upload UI & Invoice Rendering', () => {
    it('SettingsPage renders file upload controls and no raw URL input', async () => {
      await i18n.changeLanguage('ar');

      queryClient.setQueryData(['orgSettings'], {
        id: 'settings-1',
        businessName: 'شركة بنيان للمقاولات',
        businessNameEn: 'BUNYAN Contracting Co.',
        logoUrl: null,
        vatNumber: '310000000000003',
        commercialReg: '1010000000',
        defaultLanguage: 'ar',
        defaultCurrency: 'SAR',
        vatRate: 15,
        invoicePrefix: 'INV',
        statementPrefix: 'STM',
        workEntryPrefix: 'WRK',
        selfApprovalAllowed: true,
      });

      const html = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/settings']}>
              <SettingsPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Verify no raw URL input exists
      expect(html).not.toContain('id="logoUrl"');
      expect(html).not.toContain('placeholder="https://example.com/logo.png"');

      // Verify file upload input and button exist
      expect(html).toContain('id="company-logo-file-input"');
      expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
      expect(html).toContain('شعار الشركة');
      expect(html).toContain('الصيغ المدعومة: PNG, JPG, WebP بحجم أقصى 5 ميجابايت');
    });

    it('ProfessionalTaxInvoice displays custom logo image when orgSnapshot.logoUrl is provided', () => {
      const customLogoSnapshot = {
        businessName: 'شركة تجريبية للمقاولات',
        businessNameEn: 'Demo Contracting Co.',
        logoUrl: '/uploads/logo-org-12345.png',
        vatNumber: '310000000000003',
        commercialReg: '1010000000',
      };

      const mockInvoice: any = {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        issueDate: '2026-10-25',
        totalAmount: 11500,
        subtotal: 10000,
        taxAmount: 1500,
        status: 'ISSUED',
        orgSnapshot: customLogoSnapshot,
        lineItems: [],
      };

      const html = renderToStaticMarkup(
        <ProfessionalTaxInvoice
          invoice={mockInvoice}
          qrImageSrc=""
        />
      );

      expect(html).toContain('src="/uploads/logo-org-12345.png"');
      expect(html).toContain('alt="شركة تجريبية للمقاولات"');
    });

    it('ProfessionalTaxInvoice displays default Bunyan emblem when logoUrl is not provided', () => {
      const defaultSnapshot = {
        businessName: 'شركة بنيان للمقاولات',
        businessNameEn: 'BUNYAN CONTRACTING CO.',
        logoUrl: null,
        vatNumber: '310000000000003',
        commercialReg: '1010000000',
      };

      const mockInvoice: any = {
        id: 'inv-2',
        invoiceNumber: 'INV-2026-0002',
        issueDate: '2026-10-25',
        totalAmount: 5000,
        subtotal: 4347.83,
        taxAmount: 652.17,
        status: 'ISSUED',
        orgSnapshot: defaultSnapshot,
        lineItems: [],
      };

      const html = renderToStaticMarkup(
        <ProfessionalTaxInvoice
          invoice={mockInvoice}
          qrImageSrc=""
        />
      );

      expect(html).not.toContain('/uploads/');
      expect(html).toContain('بنيان • BUNYAN');
    });
  });
});
