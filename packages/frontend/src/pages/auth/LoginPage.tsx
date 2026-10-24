import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Eye, EyeOff, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react'
import { useAuth } from '../../store/authStore'
import { AuthSplitLayout, BunyanGeometricMark } from '../../components/auth/AuthSplitLayout'

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetSuccess = (location.state as any)?.passwordResetSuccess === true

  const validateFields = () => {
    let valid = true
    setEmailError(null)
    setPasswordError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setEmailError(t('validation.required'))
      valid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError(t('validation.invalidEmail'))
      valid = false
    }

    if (!password) {
      setPasswordError(t('validation.required'))
      valid = false
    }

    return valid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError(null)

    if (!validateFields()) {
      return
    }

    setIsSubmitting(true)
    try {
      await login(email.trim(), password, rememberMe)
      navigate('/dashboard')
    } catch (err: any) {
      const status = err?.response?.status
      const apiMsg =
        err?.response?.data?.error?.message ||
        (typeof err?.response?.data?.error === 'string' ? err.response.data.error : undefined)

      if (
        status === 401 ||
        (typeof apiMsg === 'string' && apiMsg.toLowerCase().includes('invalid email or password'))
      ) {
        setError(t('auth.loginError'))
      } else if (status === 429) {
        setError(t('errors.tooManyRequests', 'تم تجاوز عدد محاولات الدخول المسموح بها، يرجى الانتظار قليلاً ثم المحاولة مجدداً.'))
      } else if (!err?.response || status === 502 || status === 503 || status === 504 || (status === 500 && !err?.response?.data?.error?.code)) {
        setError(t('errors.serverConnectionError', 'تعذر الاتصال بالخادم، يرجى التأكد من تشغيل خادم النظام والاتصال بالشبكة.'))
      } else if (typeof apiMsg === 'string' && apiMsg.trim()) {
        setError(apiMsg)
      } else {
        setError(t('errors.serverError'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthSplitLayout langToggleTestId="login-lang-toggle">
      {/* 1. Compact BUNYAN Brand Heading + 2. Welcome Heading + 3. Explanatory Subtitle */}
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#EAF0F5] border border-[#18324B]/15 text-[#18324B] text-xs font-bold mb-3.5">
          <BunyanGeometricMark className="w-3.5 h-3.5 text-[#18324B]" />
          <span>{isAr ? 'بنيان • BUNYAN' : 'BUNYAN • بنيان'}</span>
        </div>
        <h1 className="text-2xl sm:text-[1.65rem] font-bold text-[#1F2937] tracking-tight leading-snug">
          {t('auth.loginTitle')}
        </h1>
        <p className="mt-2 text-sm text-[#667085] leading-relaxed">{t('auth.loginSubtitle')}</p>
      </div>

      {resetSuccess && !error && (
        <div
          role="status"
          data-testid="login-reset-success-banner"
          className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-sm text-emerald-800"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{t('auth.resetPasswordSuccessDesc')}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="login-error-alert"
          className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* 4. Login Identifier Field (Email) */}
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-[#1F2937] mb-1.5">
            {t('auth.email')}
          </label>
          <div className="relative">
            <input
              id="email"
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
              aria-describedby={emailError ? 'email-error' : undefined}
              dir="ltr"
              data-testid="login-email-input"
              className={`w-full h-11 pl-3.5 pr-10 border rounded-lg focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] hover:border-[#18324B]/40 outline-none text-sm text-[#1F2937] placeholder:text-[#667085]/60 transition-all ${
                emailError ? 'border-red-500 bg-red-50/30' : 'border-[#E4E7EC] bg-[#FFFFFF]'
              }`}
              placeholder="admin@bunyan.sa"
            />
            <Mail
              aria-hidden="true"
              className="w-4 h-4 text-[#667085] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
          </div>
          {emailError && (
            <p
              id="email-error"
              role="alert"
              className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{emailError}</span>
            </p>
          )}
        </div>

        {/* 5. Password Field */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-semibold text-[#1F2937]">
              {t('auth.password')}
            </label>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError(null)
              }}
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? 'password-error' : undefined}
              dir="ltr"
              data-testid="login-password-input"
              className={`w-full h-11 pl-3.5 pr-10 border rounded-lg focus:ring-2 focus:ring-[#18324B]/20 focus:border-[#18324B] hover:border-[#18324B]/40 outline-none text-sm text-[#1F2937] transition-all ${
                passwordError ? 'border-red-500 bg-red-50/30' : 'border-[#E4E7EC] bg-[#FFFFFF]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              data-testid="toggle-password-visibility"
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#667085] hover:text-[#18324B] focus:outline-none focus:ring-2 focus:ring-[#18324B] rounded-r-lg transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {passwordError && (
            <p
              id="password-error"
              role="alert"
              className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{passwordError}</span>
            </p>
          )}
        </div>

        {/* 6. Remember Me Checkbox & 7. Forgot Password Link */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <label
            htmlFor="remember-me"
            className="inline-flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-[#1F2937] hover:text-[#18324B] transition-colors"
          >
            <input
              id="remember-me"
              name="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              data-testid="login-remember-me-checkbox"
              className="w-4 h-4 rounded border-[#E4E7EC] text-[#18324B] accent-[#18324B] focus:ring-2 focus:ring-[#18324B] focus:ring-offset-1 cursor-pointer"
            />
            <span>{t('auth.rememberMe')}</span>
          </label>

          <Link
            to="/forgot-password"
            data-testid="forgot-password-link"
            className="text-xs font-semibold text-[#18324B] hover:text-[#B97816] hover:underline focus:outline-none focus:ring-2 focus:ring-[#18324B] rounded px-1 py-0.5 transition-colors"
          >
            {t('auth.forgotPassword')}
          </Link>
        </div>

        {/* 8. Primary Login Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="login-submit-btn"
          className="w-full h-11 px-4 bg-[#18324B] hover:bg-[#102437] active:bg-[#0D1D2C] disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#18324B] focus:ring-offset-2"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Lock className="w-4 h-4 text-[#E6A23C]" />
          )}
          <span>{isSubmitting ? t('common.loading') : t('auth.signIn')}</span>
        </button>
      </form>

      {/* 9. Existing Supporting Registration Link */}
      <div className="mt-7 pt-5 border-t border-[#E4E7EC] text-center text-sm text-[#667085]">
        <span>{t('auth.noAccount')} </span>
        <Link
          to="/register"
          className="font-semibold text-[#18324B] hover:text-[#B97816] hover:underline focus:outline-none focus:ring-2 focus:ring-[#18324B] rounded px-1 transition-colors"
        >
          {t('auth.signUp')}
        </Link>
      </div>
    </AuthSplitLayout>
  )
}
