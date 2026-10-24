import { useState } from 'react'
import { MapPin, ExternalLink, X, CheckCircle2, AlertCircle, Compass } from 'lucide-react'
import { isValidGoogleMapsUrl } from '../../lib/geo'

interface GoogleMapsLocationPickerProps {
  value: string
  onChange: (value: string) => void
  isAr: boolean
  label?: string
}

export function GoogleMapsLocationPicker({
  value,
  onChange,
  isAr,
  label,
}: GoogleMapsLocationPickerProps) {
  const [touchState, setTouchState] = useState(false)
  const trimmedValue = (value || '').trim()
  const hasValue = trimmedValue.length > 0
  const isValid = hasValue ? isValidGoogleMapsUrl(trimmedValue) : true
  const showError = hasValue && !isValid

  const handleOpenGoogleMapsSearch = () => {
    window.open('https://www.google.com/maps', '_blank', 'noopener,noreferrer')
  }

  const handleOpenCurrentLink = () => {
    if (isValid && hasValue) {
      window.open(trimmedValue, '_blank', 'noopener,noreferrer')
    }
  }

  const handleClear = () => {
    onChange('')
    setTouchState(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3 sm:col-span-2">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-900">
              {label || (isAr ? 'موقع المشروع على الخريطة' : 'Project Location on Map')}
            </h4>
            <p className="text-[11px] text-gray-500">
              {isAr
                ? 'اربط المشروع بإحداثيات أو رابط خرائط Google لتسهيل وصول المهندسين والمقاولين'
                : 'Associate project with Google Maps to help engineers and contractors navigate'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenGoogleMapsSearch}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 text-xs font-medium shrink-0 transition-colors shadow-sm"
          title={isAr ? 'فتح تطبيق خرائط Google لتحديد الموقع' : 'Open Google Maps to find location'}
        >
          <Compass className="w-3.5 h-3.5 text-blue-600" />
          <span>{isAr ? 'فتح خرائط Google' : 'Open Google Maps'}</span>
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </button>
      </div>

      {/* Input Field with Clear & Action Buttons */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-gray-700">
          {isAr ? 'رابط مشاركة الموقع (Google Maps Link)' : 'Google Maps Share Link'}{' '}
          <span className="text-xs text-gray-400 font-normal">
            ({isAr ? 'اختياري' : 'Optional'})
          </span>
        </label>
        <div className="relative flex items-center">
          <input
            type="url"
            dir="ltr"
            value={value}
            onBlur={() => setTouchState(true)}
            onChange={(e) => {
              onChange(e.target.value)
              setTouchState(true)
            }}
            placeholder="https://maps.app.goo.gl/... or https://maps.google.com/?q=..."
            className={`w-full px-3 py-2 text-xs font-mono rounded-lg border bg-white outline-none transition-colors ${
              showError
                ? 'border-red-300 focus:ring-2 focus:ring-red-200'
                : hasValue && isValid
                ? 'border-emerald-300 focus:ring-2 focus:ring-emerald-200'
                : 'border-gray-300 focus:ring-2 focus:ring-blue-200'
            } ${hasValue ? (isAr ? 'pl-20' : 'pr-20') : ''}`}
          />

          {hasValue && (
            <div
              className={`absolute flex items-center gap-1 ${
                isAr ? 'left-2' : 'right-2'
              }`}
            >
              {isValid && (
                <button
                  type="button"
                  onClick={handleOpenCurrentLink}
                  className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                  title={isAr ? 'معاينة الموقع' : 'Preview location'}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                title={isAr ? 'مسح الرابط' : 'Clear location'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Validation / Status Messages */}
      {showError && touchState && (
        <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {isAr
              ? 'يرجى إدخال رابط صالح من خرائط Google يبدأ بـ https:// (مثل روابط المشاركة maps.app.goo.gl أو maps.google.com أو goo.gl/maps)'
              : 'Please enter a valid Google Maps HTTPS link (e.g. maps.app.goo.gl, maps.google.com, or goo.gl/maps)'}
          </span>
        </div>
      )}

      {hasValue && isValid && (
        <div className="flex items-center justify-between gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">
              {isAr ? 'تم التحقق من صحة رابط خرائط Google' : 'Valid Google Maps Link Verified'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenCurrentLink}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline"
          >
            <span>{isAr ? 'تجربة فتح الموقع' : 'Test Open'}</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}
