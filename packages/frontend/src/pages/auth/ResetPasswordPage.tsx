import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react'
import { api } from '../../lib/api'
import { AuthSplitLayout } from '../../components/auth/AuthSplitLayout'

export function ResetPasswordPage() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const token = searchParams.get('token') || ''

  const [verifying, setVerifying] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  useEffect(() => {
    let active = true
    if (!token.trim()) {
      setVerifying(false)
      setTokenValid(false)
      return
    }

    api
      .get('/auth/verify-reset-token', { params: { token } })
      .then((res) => {
        if (!active) return
        const data = res.data?.data || res.data
        setTokenValid(Boolean(data?.valid))
        setMaskedEmail(data?.email || null)
      })
      .catch(() => {
        if (!active) return
        setTokenValid(false)
      })
      .finally(() => {
        if (active) setVerifying(false)
      })

    return () => {
      active = false
    }
  }, [token])

  const hasMinLength = newPassword.length >= 8
  const hasUppercase = /[A-Z]/.test(newPassword)
  const hasNumber = /[0-9]/.test(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError(null)

    if (!hasMinLength || !hasUppercase || !hasNumber) {
      setError(t('validation.minPassword'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('validation.passwordMatch'))
      return
    }

    setIsSubmitting(true)
    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword,
        confirmPassword,
      })
      setIsSuccess(true)
      setTimeout(() => {
        navigate('/login', { state: { passwordResetSuccess: true } })
      }, 1500)
    } catch (err: any) {
      const apiMsg = err?.response?.data?.error?.message
      setError(apiMsg || t('auth.invalidOrExpiredToken'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft

  return (
    <AuthSplitLayout langToggleTestId="reset-lang-toggle">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1F2937]">{t('auth.resetPasswordTitle')}</h1>
        <p className="mt-1.5 text-sm text-[#667085]">{t('auth.resetPasswordSubtitle')}</p>
        {maskedEmail && (
          <p className="mt-1.5 text-xs font-mono font-semibold text-[#18324B]" dir="ltr">
            {maskedEmail}
          </p>
        )}
      </div>

      {verifying ? (
        <div className="py-10 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 text-[#18324B] animate-spin" />
          <p className="text-xs text-[#667085]">{t('common.loading')}</p>
        </div>
      ) : !tokenValid && !isSuccess ? (
        <div className="space-y-4" data-testid="reset-token-invalid">
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-sm text-red-800"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <span>{t('auth.invalidOrExpiredToken')}</span>
          </div>
          <Link
            to="/forgot-password"
            className="w-full py-2.5 px-4 bg-[#18324B] hover:bg-[#102437] text-white font-semibold rounded-xl shadow-sm transition-colors text-sm flex items-center justify-center"
          >
            {t('auth.requestNewResetLink')}
          </Link>
          <div className="text-center pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#18324B] hover:text-[#B97816] hover:underline"
            >
              <BackIcon className="w-4 h-4" />
              <span>{t('auth.backToLogin')}</span>
            </Link>
          </div>
        </div>
      ) : isSuccess ? (
        <div className="space-y-4" data-testid="reset-password-success">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-emerald-900">
                {t('auth.resetPasswordSuccessTitle')}
              </h2>
              <p className="text-xs text-emerald-800 mt-1">{t('auth.resetPasswordSuccessDesc')}</p>
            </div>
          </div>
          <Link
            to="/login"
            className="w-full py-2.5 px-4 bg-[#18324B] hover:bg-[#102437] text-white font-semibold rounded-xl shadow-sm transition-colors text-sm flex items-center justify-center"
          >
            {t('auth.signIn')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-700"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="newPassword" className="block text-sm font-semibold text-[#1F2937] mb-1.5">
              {t('auth.newPassword')}
            </label>
            <div className="relative">
              <input
                id="newPassword"
                name="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                dir="ltr"
                data-testid="reset-new-password-input"
                className="w-full ps-3.5 pe-10 py-2.5 border border-[#E4E7EC] rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937]"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((p) => !p)}
                aria-label={showNewPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#667085] hover:text-[#18324B] focus:outline-none"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Live Password Complexity Checklist */}
            <ul className="mt-2.5 space-y-1 text-xs">
              <li
                className={`flex items-center gap-1.5 ${
                  hasMinLength ? 'text-emerald-600 font-medium' : 'text-[#667085]'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('auth.passwordReqLength')}</span>
              </li>
              <li
                className={`flex items-center gap-1.5 ${
                  hasUppercase ? 'text-emerald-600 font-medium' : 'text-[#667085]'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('auth.passwordReqUppercase')}</span>
              </li>
              <li
                className={`flex items-center gap-1.5 ${
                  hasNumber ? 'text-emerald-600 font-medium' : 'text-[#667085]'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t('auth.passwordReqNumber')}</span>
              </li>
            </ul>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-semibold text-[#1F2937] mb-1.5"
            >
              {t('auth.confirmNewPassword')}
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                dir="ltr"
                data-testid="reset-confirm-password-input"
                className={`w-full ps-3.5 pe-10 py-2.5 border rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937] ${
                  confirmPassword && !passwordsMatch ? 'border-red-400' : 'border-[#E4E7EC]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((p) => !p)}
                aria-label={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#667085] hover:text-[#18324B] focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && !passwordsMatch && (
              <p className="mt-1 text-xs text-red-600 font-medium">{t('validation.passwordMatch')}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="reset-submit-btn"
            className="w-full py-2.5 px-4 bg-[#18324B] hover:bg-[#102437] disabled:opacity-50 text-white font-semibold rounded-xl shadow-sm transition-colors text-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#18324B] focus:ring-offset-1"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isSubmitting ? t('common.loading') : t('auth.resetPasswordSubmit')}</span>
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
