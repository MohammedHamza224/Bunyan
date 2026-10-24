import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  KeyRound,
  Mail,
} from 'lucide-react'
import { api } from '../../lib/api'
import { AuthSplitLayout } from '../../components/auth/AuthSplitLayout'

export function ForgotPasswordPage() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedData, setSubmittedData] = useState<{
    message: string
    devResetToken?: string
    devResetUrl?: string
  } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError(null)
    setEmailError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setEmailError(t('validation.required'))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError(t('validation.invalidEmail'))
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.post('/auth/forgot-password', { email: trimmedEmail })
      setSubmittedData(res.data?.data || res.data)
    } catch (err: any) {
      const apiMsg = err?.response?.data?.error?.message
      setError(apiMsg || t('errors.serverError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft

  return (
    <AuthSplitLayout langToggleTestId="forgot-lang-toggle">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1F2937]">{t('auth.forgotPasswordTitle')}</h1>
        <p className="mt-1.5 text-sm text-[#667085]">{t('auth.forgotPasswordSubtitle')}</p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {submittedData ? (
        <div className="space-y-4" data-testid="forgot-password-success">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-emerald-900">
                {t('auth.resetRequestSentTitle')}
              </h2>
              <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                {t('auth.resetRequestSentDesc')}
              </p>
            </div>
          </div>

          {/* Local Development Helper Link when external SMTP is not configured */}
          {submittedData.devResetToken && (
            <div
              className="p-4 rounded-xl bg-[#EAF0F5] border border-[#18324B]/20 space-y-2.5"
              data-testid="dev-reset-link-box"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[#18324B]">
                <KeyRound className="w-4 h-4 text-[#B97816] shrink-0" />
                <span>
                  {isAr
                    ? 'رابط الاستعادة المباشر (بيئة التطوير المحلية)'
                    : 'Direct Recovery Link (Local Development Mode)'}
                </span>
              </div>
              <p className="text-xs text-[#1F2937]">
                {isAr
                  ? 'نظراً لتشغيل النظام في بيئة التطوير بدون خادم بريد خارجي (SMTP)، يمكنك الانتقال مباشرة لتعيين كلمة المرور الجديدة:'
                  : 'Since the app is running locally without an external SMTP server, click below to proceed directly to password reset:'}
              </p>
              <Link
                to={`/reset-password?token=${encodeURIComponent(submittedData.devResetToken)}`}
                data-testid="dev-reset-password-btn"
                className="w-full py-2 px-3 bg-[#18324B] hover:bg-[#102437] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <span>{t('auth.resetPasswordTitle')}</span>
              </Link>
            </div>
          )}

          <div className="pt-2 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#18324B] hover:text-[#B97816] hover:underline"
            >
              <BackIcon className="w-4 h-4" />
              <span>{t('auth.backToLogin')}</span>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="reset-email" className="block text-sm font-semibold text-[#1F2937] mb-1.5">
              {t('auth.email')}
            </label>
            <div className="relative">
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'reset-email-error' : undefined}
                dir="ltr"
                data-testid="forgot-email-input"
                className={`w-full ps-3.5 pe-10 py-2.5 border rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937] transition-colors ${
                  emailError ? 'border-red-400 bg-red-50/30' : 'border-[#E4E7EC] bg-white'
                }`}
                placeholder="name@example.com"
              />
              <Mail className="w-4 h-4 text-[#667085] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {emailError && (
              <p id="reset-email-error" className="mt-1 text-xs text-red-600 font-medium">
                {emailError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="forgot-submit-btn"
            className="w-full py-2.5 px-4 bg-[#18324B] hover:bg-[#102437] disabled:opacity-50 text-white font-semibold rounded-xl shadow-sm transition-colors text-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#18324B] focus:ring-offset-1"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isSubmitting ? t('common.loading') : t('auth.sendResetLink')}</span>
          </button>

          <div className="mt-6 pt-5 border-t border-[#E4E7EC] text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#18324B] hover:text-[#B97816] hover:underline"
            >
              <BackIcon className="w-4 h-4" />
              <span>{t('auth.backToLogin')}</span>
            </Link>
          </div>
        </form>
      )}
    </AuthSplitLayout>
  )
}
