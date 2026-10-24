import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import i18n from '../i18n'
import { ActionMenu } from '../components/ui/ActionMenu'
import { RecordActionModal } from '../components/ui/RecordActionModal'
import ar from '../i18n/locales/ar'
import en from '../i18n/locales/en'

describe('Data Management System — UI Components & Localization', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar')
  })

  it('contains all required data management localization keys in Arabic and English dictionaries', () => {
    // Check Arabic
    expect(ar.common.dataMgmt).toBeDefined()
    expect(ar.common.dataMgmt.archive).toBe('أرشفة')
    expect(ar.common.dataMgmt.restore).toBe('استعادة')
    expect(ar.common.dataMgmt.delete).toBe('حذف')
    expect(ar.common.dataMgmt.permanentDelete).toBe('حذف نهائي')
    expect(ar.common.dataMgmt.archiveInstead).toBe('أرشفة السجل بدلاً من الحذف')
    expect(ar.common.dataMgmt.confirmArchiveTitle).toBe('تأكيد أرشفة السجل')
    expect(ar.common.dataMgmt.confirmRestoreTitle).toBe('تأكيد استعادة السجل')

    // Check English
    expect(en.common.dataMgmt).toBeDefined()
    expect(en.common.dataMgmt.archive).toBe('Archive')
    expect(en.common.dataMgmt.restore).toBe('Restore')
    expect(en.common.dataMgmt.delete).toBe('Delete')
    expect(en.common.dataMgmt.permanentDelete).toBe('Permanent Delete')
    expect(en.common.dataMgmt.archiveInstead).toBe('Archive Instead of Deleting')
  })

  it('renders ActionMenu trigger button with proper accessibility attributes', () => {
    const html = renderToStaticMarkup(
      <ActionMenu
        isArchived={false}
        canDelete={true}
        canPermanentDelete={true}
        onView={() => {}}
        onEdit={() => {}}
        onArchive={() => {}}
        onDelete={() => {}}
        onPermanentDelete={() => {}}
      />
    )

    expect(html).toContain('data-testid="record-actions-trigger"')
    expect(html).toContain('<button')
  })

  it('renders RecordActionModal for Archive in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const html = renderToStaticMarkup(
      <RecordActionModal
        isOpen={true}
        actionType="archive"
        recordName="شركة المقاولات المتحدة"
        recordTypeLabel="العملاء"
        canDelete={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(html).toContain('شركة المقاولات المتحدة')
    expect(html).toContain('تأكيد أرشفة السجل')
    expect(html).toContain('سيتم نقل هذا السجل إلى الأرشيف')
  })

  it('renders RecordActionModal for Restore in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const html = renderToStaticMarkup(
      <RecordActionModal
        isOpen={true}
        actionType="restore"
        recordName="مشروع برج الرياض"
        recordTypeLabel="المواقع"
        canDelete={false}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(html).toContain('مشروع برج الرياض')
    expect(html).toContain('تأكيد استعادة السجل')
    expect(html).toContain('سيتم إعادة تفعيل هذا السجل')
  })

  it('renders Blocked Delete state in RecordActionModal with dependency explanation and Archive Instead option', async () => {
    await i18n.changeLanguage('ar')
    const blockerReason = 'لا يمكن حذف هذا الموقع لارتباطه بـ 12 من بنود الأعمال المسجلة و 2 من المستخلصات.'
    const html = renderToStaticMarkup(
      <RecordActionModal
        isOpen={true}
        actionType="delete"
        recordName="موقع برج الفيصلية"
        recordTypeLabel="المواقع"
        canDelete={false}
        blockedReason={blockerReason}
        onClose={() => {}}
        onConfirm={() => {}}
        onArchiveInstead={() => {}}
      />
    )

    expect(html).toContain('لا يمكن حذف هذا السجل')
    expect(html).toContain(blockerReason)
    expect(html).toContain('أرشفة السجل بدلاً من الحذف')
  })

  it('renders Permanent Delete state for Admin with severe warning in English', async () => {
    await i18n.changeLanguage('en')
    const html = renderToStaticMarkup(
      <RecordActionModal
        isOpen={true}
        actionType="permanent_delete"
        recordName="Draft Client"
        recordTypeLabel="Clients"
        canDelete={true}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    )

    expect(html).toContain('Draft Client')
    expect(html).toContain('Permanent Delete')
    expect(html).toContain('permanently deleted')
    expect(html).toContain('cannot be undone')
  })
})
