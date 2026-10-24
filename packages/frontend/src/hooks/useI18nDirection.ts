import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function useI18nDirection() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('dir', dir)
    document.documentElement.setAttribute('lang', lang)
    document.title =
      lang === 'ar'
        ? 'بنيان — نظام إدارة أعمال المقاولات'
        : 'BUNYAN — Construction Management Platform'
    localStorage.setItem('language', lang)
  }, [i18n.language])
}
