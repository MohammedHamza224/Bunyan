import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Clock } from 'lucide-react'
import { formatCurrentDate, formatCurrentTime } from '../../lib/utils'

interface HeaderCurrentDateProps {
  className?: string
  /**
   * Optional fixed date for testing or SSR
   */
  fixedDate?: Date
}

export function HeaderCurrentDate({ className = '', fixedDate }: HeaderCurrentDateProps) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [currentDate, setCurrentDate] = useState<Date>(() => fixedDate || new Date())

  useEffect(() => {
    if (fixedDate) {
      setCurrentDate(fixedDate)
      return
    }

    const timer = setInterval(() => {
      setCurrentDate(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [fixedDate])

  const formattedDate = formatCurrentDate(currentDate, i18n.language)
  const formattedTime = formatCurrentTime(currentDate, i18n.language)

  const timezoneTooltip = isAr
    ? 'توقيت المملكة العربية السعودية (الرياض)'
    : 'Saudi Arabia Standard Time (Riyadh)'

  return (
    <div
      data-testid="header-current-date"
      title={timezoneTooltip}
      aria-label={timezoneTooltip}
      className={`flex items-center gap-2 px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg border border-[#E4E7EC] bg-[#F8FAFC] text-[#18324B] shadow-2xs select-none transition-colors ${className}`}
    >
      {/* Calendar Icon */}
      <Calendar className="w-4 h-4 shrink-0 text-[#E6A23C]" aria-hidden="true" />

      {/* Date text (Desktop / Tablet: full date, Mobile: compact date) */}
      <span
        data-testid="header-current-date-text"
        className="text-xs md:text-sm font-semibold tracking-tight text-[#18324B] whitespace-nowrap"
      >
        {formattedDate}
      </span>

      {/* Subtle divider */}
      <span className="hidden sm:inline-block w-px h-3.5 bg-[#CBD5E1]" aria-hidden="true" />

      {/* Live Time */}
      <div
        data-testid="header-current-time-container"
        className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#475467] whitespace-nowrap"
      >
        <Clock className="w-3.5 h-3.5 text-[#64748B]" aria-hidden="true" />
        <span data-testid="header-current-time-text" className="font-mono tabular-nums">
          {formattedTime}
        </span>
      </div>
    </div>
  )
}
