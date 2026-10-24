import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/authStore'
import { AuthSplitLayout } from '../../components/auth/AuthSplitLayout'

export function RegisterPage() {
  const { t, i18n } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()

  const [organizationName, setOrganizationName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isAr = i18n.language === 'ar'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!nameAr.trim() || !email.trim() || !password) {
      setError(t('errors.required'))
      return
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(
        isAr
          ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتحتوي على حرف كبير ورقم'
          : 'Password must be at least 8 characters and include an uppercase letter and a number'
      )
      return
    }

    setIsSubmitting(true)
    try {
      await register({
        organizationName: organizationName.trim() || undefined,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || undefined,
        email: email.trim(),
        password,
      })
      navigate('/dashboard')
    } catch (err: any) {
      const apiMsg = err?.response?.data?.error?.message
      setError(apiMsg || t('errors.serverError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthSplitLayout langToggleTestId="register-lang-toggle">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1F2937]">{t('auth.registerTitle')}</h1>
        <p className="mt-1.5 text-sm text-[#667085]">{t('auth.registerSubtitle')}</p>
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

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="orgName" className="block text-sm font-semibold text-[#1F2937] mb-1">
            {t('auth.organizationName')}{' '}
            <span className="text-xs font-normal text-[#667085]">({t('common.optional')})</span>
          </label>
          <input
            id="orgName"
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-[#E4E7EC] rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937]"
            placeholder={
              isAr ? 'يمكنك إضافته أو تعديله لاحقًا من الإعدادات' : 'Can be set later in Settings'
            }
          />
        </div>

        <div>
          <label htmlFor="nameAr" className="block text-sm font-semibold text-[#1F2937] mb-1">
            {t('auth.nameAr')} *
          </label>
          <input
            id="nameAr"
            type="text"
            required
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-[#E4E7EC] rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937]"
          />
        </div>

        <div>
          <label htmlFor="nameEn" className="block text-sm font-semibold text-[#1F2937] mb-1">
            {t('auth.nameEn')}{' '}
            <span className="text-xs font-normal text-[#667085]">({t('common.optional')})</span>
          </label>
          <input
            id="nameEn"
            type="text"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            dir="ltr"
            className="w-full px-3.5 py-2.5 border border-[#E4E7EC] rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937]"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-[#1F2937] mb-1">
            {t('auth.email')} *
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="w-full px-3.5 py-2.5 border border-[#E4E7EC] rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937]"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-[#1F2937] mb-1">
            {t('auth.password')} *
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="w-full ps-3.5 pe-10 py-2.5 border border-[#E4E7EC] rounded-xl focus:ring-2 focus:ring-[#18324B] focus:border-[#18324B] outline-none text-sm text-[#1F2937]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#667085] hover:text-[#18324B] focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 bg-[#18324B] hover:bg-[#102437] disabled:opacity-50 text-white font-semibold rounded-xl shadow-sm transition-colors text-sm flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{isSubmitting ? t('common.loading') : t('auth.signUp')}</span>
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-[#E4E7EC] text-center text-sm text-[#667085]">
        <span>{t('auth.hasAccount')} </span>
        <Link to="/login" className="font-semibold text-[#18324B] hover:text-[#B97816] hover:underline">
          {t('auth.signIn')}
        </Link>
      </div>
    </AuthSplitLayout>
  )
}
