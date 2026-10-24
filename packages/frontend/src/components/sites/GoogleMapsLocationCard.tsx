import { MapPin, ExternalLink, MapPinOff, Plus } from 'lucide-react'
import { isValidGoogleMapsUrl } from '../../lib/geo'

interface GoogleMapsLocationCardProps {
  googleMapsUrl?: string | null
  address?: string | null
  siteName: string
  isAr: boolean
  canEdit?: boolean
  onEditLocation?: () => void
}

export function GoogleMapsLocationCard({
  googleMapsUrl,
  address,
  siteName,
  isAr,
  canEdit,
  onEditLocation,
}: GoogleMapsLocationCardProps) {
  const cleanUrl = (googleMapsUrl || '').trim()
  const hasValidMap = cleanUrl.length > 0 && isValidGoogleMapsUrl(cleanUrl)

  const handleOpenMap = () => {
    if (hasValidMap) {
      window.open(cleanUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3.5">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              {isAr ? 'موقع المشروع على الخريطة' : 'Project Location on Map'}
            </h3>
            <p className="text-[11px] text-gray-500">
              {isAr ? 'الإحداثيات والموقع الجغرافي' : 'Geographic coordinates & navigation link'}
            </p>
          </div>
        </div>

        {hasValidMap && canEdit && onEditLocation && (
          <button
            type="button"
            onClick={onEditLocation}
            className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
          >
            {isAr ? 'تعديل الرابط' : 'Change Link'}
          </button>
        )}
      </div>

      {/* Content */}
      {hasValidMap ? (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100 space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs text-emerald-950">
                <p className="font-semibold">{siteName}</p>
                {address && <p className="text-gray-600">{address}</p>}
                <p className="font-mono text-[11px] text-gray-500 truncate max-w-xs sm:max-w-md pt-0.5" dir="ltr">
                  {cleanUrl}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenMap}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition-all shadow-sm shadow-emerald-200 active:scale-[0.99]"
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'عرض الموقع على خرائط Google' : 'View on Google Maps'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="text-center py-5 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 space-y-2.5">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mx-auto text-gray-400">
            <MapPinOff className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-700">
              {isAr ? 'لم يتم تحديد موقع على الخريطة لهذا المشروع' : 'No map location specified for this project'}
            </p>
            <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
              {isAr
                ? 'يمكنك إضافة رابط من تطبيق خرائط Google لتسهيل وصول فرق التنفيذ والمشرفين إلى الموقع'
                : 'Add a Google Maps share link to help field engineers and supervisors locate the site easily'}
            </p>
          </div>

          {canEdit && onEditLocation && (
            <button
              type="button"
              onClick={onEditLocation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold shadow-sm transition-colors mt-1"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>{isAr ? 'إضافة رابط الموقع' : 'Add Map Location'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
