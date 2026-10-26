import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Bunyan ErrorBoundary caught an unhandled render error]:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    window.location.href = '/dashboard'
  }

  public render() {
    if (this.state.hasError) {
      const isArabic = document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar'

      return (
        <div
          dir={isArabic ? 'rtl' : 'ltr'}
          className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800"
        >
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">
                {isArabic ? 'حدث خطأ غير متوقع في العرض' : 'An unexpected display error occurred'}
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {isArabic
                  ? 'تم استيعاب الخطأ لمنع إغلاق النظام. يرجى إعادة المحاولة أو الانتقال إلى لوحة التحكم.'
                  : 'The error was caught to maintain application stability. Please retry or return to the dashboard.'}
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-slate-100 rounded-lg p-3 text-xs font-mono text-red-700 overflow-x-auto max-h-32 border border-slate-200">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isArabic ? 'إعادة تحميل الصفحة' : 'Reload Page'}</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium text-sm transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>{isArabic ? 'الرئيسية' : 'Dashboard'}</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
