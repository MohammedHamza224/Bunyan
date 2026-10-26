import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface ModuleListPageProps {
  titleKey: string
  endpoint: string
  emptyKey: string
}

export function ModuleListPage({ titleKey, endpoint, emptyKey }: ModuleListPageProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const { data, isLoading } = useQuery({
    queryKey: [endpoint],
    queryFn: async () => {
      const res = await api.get(endpoint)
      return res.data?.data?.items || res.data?.data || []
    },
  })

  const items = Array.isArray(data) ? data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t(titleKey)}</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">{t(emptyKey)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] print:min-w-0 text-sm text-start">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase">
                <tr>
                  <th className="px-6 py-3 text-start">{t('common.name')}</th>
                  <th className="px-6 py-3 text-start">{t('common.status')}</th>
                  <th className="px-6 py-3 text-start">{t('common.createdAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3.5 font-medium text-gray-900">
                      {item.nameAr || item.itemNameAr || item.referenceNo || item.id}
                    </td>
                    <td className="px-6 py-3.5 text-gray-600">{item.status || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-500" dir="ltr">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
