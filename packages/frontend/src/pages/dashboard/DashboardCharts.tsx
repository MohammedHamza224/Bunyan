import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react'
import {
  formatCurrency,
  getCurrencySymbol,
  formatNumber,
  formatCount,
} from '../../lib/utils'

interface DashboardChartsProps {
  stats: any
  currency: string
  isAr: boolean
  periodQuery: string
}

export function DashboardCharts({ stats, currency, isAr, periodQuery }: DashboardChartsProps) {
  const formatMoney = (val: number | string | undefined, curr = currency) => {
    return formatCurrency(val, isAr ? 'ar-SA' : 'en-US', curr)
  }

  const formatItemCount = (val: number | string | undefined) => {
    return formatCount(val, isAr ? 'ar-SA' : 'en-US')
  }

  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs space-y-1.5"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <p className="font-bold text-gray-900 border-b border-gray-100 pb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`bar-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 font-medium" style={{ color: entry.color }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}:
              </span>
              <span className="font-mono font-bold text-gray-900">
                {formatMoney(entry.value)}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const itemData = payload[0].payload
      return (
        <div
          className="bg-white p-3 rounded-xl border border-gray-200 shadow-xl text-xs space-y-1.5"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <p className="font-bold border-b border-gray-100 pb-1" style={{ color: itemData.color }}>
            {isAr ? itemData.labelAr : itemData.labelEn}
          </p>
          <div className="flex items-center justify-between gap-3 text-gray-600">
            <span>{isAr ? 'عدد الفواتير:' : 'Invoices Count:'}</span>
            <span className="font-mono font-bold text-gray-900">{formatItemCount(itemData.count)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-gray-600">
            <span>{isAr ? 'إجمالي القيمة:' : 'Total Amount:'}</span>
            <span className="font-mono font-bold text-gray-900">{formatMoney(itemData.amount)}</span>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6 pt-2" data-testid="dashboard-analytics-section">
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h2 className="text-base sm:text-lg font-bold text-gray-900">
            {isAr ? 'التحليلات المالية والتشغيلية المتقدمة' : 'Executive Business Analytics'}
          </h2>
        </div>
        <span className="text-xs text-gray-500">
          {isAr
            ? 'مؤشرات الأداء المالي والمطابقة المحاسبية المباشرة'
            : 'Direct financial performance and reconciliation metrics'}
        </span>
      </div>

      {/* Charts Row: Monthly Performance Bar Chart + Payment Status Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Bar Chart: Monthly Financial Performance (2 columns) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {isAr ? 'الأداء المالي الشهري' : 'Monthly Financial Performance'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr
                  ? 'مقارنة الفواتير المصدرة بالتحصيلات النقدية الفعلية والرصيد المتبقي'
                  : 'Comparison between Invoices Issued, Cash Collected, and Remaining Balance'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">
                {getCurrencySymbol(currency, isAr)}
              </span>
              <Link
                to={`/reports?tab=invoices${periodQuery}`}
                className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title={isAr ? 'عرض تقرير الفواتير المالي' : 'View Financial Invoices Report'}
              >
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {stats.monthlyFinancialPerformance &&
          stats.monthlyFinancialPerformance.some(
            (m: any) => m.invoicedAmount !== 0 || m.collectedAmount !== 0 || m.outstandingAmount !== 0
          ) ? (
            <div className="h-72 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.monthlyFinancialPerformance || []}
                  margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey={isAr ? 'labelAr' : 'labelEn'}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => {
                      const num = Number(val ?? 0)
                      if (Math.abs(num) >= 1000) {
                        return `${formatNumber(num / 1000, isAr ? 'ar-SA' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}k`
                      }
                      return formatCount(num, isAr ? 'ar-SA' : 'en-US')
                    }}
                  />
                  <RechartsTooltip content={<CustomBarTooltip />} />
                  <RechartsLegend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
                  />
                  <Bar
                    dataKey="invoicedAmount"
                    name={isAr ? 'الفواتير المصدرة' : 'Invoices Issued'}
                    fill="#2563EB"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="collectedAmount"
                    name={isAr ? 'التحصيلات النقدية' : 'Cash Collected'}
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="outstandingAmount"
                    name={isAr ? 'الرصيد المستحق' : 'Outstanding Balance'}
                    fill="#F43F5E"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 w-full flex flex-col items-center justify-center text-center p-6 bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
              <BarChart3 className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-xs font-semibold text-gray-600">
                {isAr ? 'لا توجد حركات مالية مسجلة لهذه الفترة' : 'No financial transactions recorded for this period'}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isAr
                  ? 'ستظهر مؤشرات الأداء المالي تلقائياً عند اعتماد الفواتير وتسجيل المدفوعات'
                  : 'Performance columns will appear automatically upon issuing invoices or recording collections'}
              </p>
            </div>
          )}
        </div>

        {/* Secondary Donut Chart: Invoice Payment Status (1 column) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {isAr ? 'حالة سداد الفواتير' : 'Invoice Payment Status'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr ? 'توزيع الفواتير حسب حالة التحصيل' : 'Receivables breakdown by collection status'}
              </p>
            </div>
            <PieChartIcon className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="h-56 w-full relative" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.paymentStatusDistribution || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="count"
                >
                  {(stats.paymentStatusDistribution || []).map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Center counter inside donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-extrabold text-gray-900 font-mono">
                {formatItemCount(stats.totalInvoices)}
              </span>
              <span className="text-[10px] text-gray-500">
                {isAr ? 'إجمالي الفواتير' : 'Total Invoices'}
              </span>
            </div>
          </div>

          {/* Legend Breakdown (Mutually Exclusive Partition) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-xs">
            {(stats.paymentStatusDistribution || []).map((item: any) => (
              <div key={item.key} className="flex flex-col p-2 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-gray-700 font-semibold truncate text-[11px]">
                    {isAr ? item.labelAr : item.labelEn}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">{isAr ? 'العدد' : 'Qty'}</span>
                  <span className="font-bold font-mono text-gray-900">{formatItemCount(item.count)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Dedicated Overdue Callout Banner */}
          {Number(stats.overdueAmount) > 0 && (
            <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-xs bg-rose-50/80 px-2.5 py-1.5 rounded-lg border border-rose-100">
              <div className="flex items-center gap-1.5 text-rose-700 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{isAr ? 'منها متأخرة السداد:' : 'Overdue invoices:'}</span>
              </div>
              <Link
                to="/reports?tab=receivables&overdueOnly=true"
                className="font-bold font-mono text-rose-700 hover:underline flex items-center gap-1 text-[11px]"
              >
                <span>{formatMoney(stats.overdueAmount)}</span>
                <span className="text-rose-600">({formatItemCount(stats.overdueInvoicesCount)})</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
