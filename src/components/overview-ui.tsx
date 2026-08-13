export function OverviewCanvas({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-3xl bg-[#f6f3ee] p-5 sm:p-6">{children}</div>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</div>
  )
}

export function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-neutral-100 pb-3">
      <h3 className="text-base font-bold text-neutral-900">{title}</h3>
      {subtitle && <span className="text-sm text-neutral-500">{subtitle}</span>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  description,
  accentDot,
}: {
  label: string
  value: string
  description?: string
  accentDot?: string
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {accentDot && <span className={`h-2 w-2 rounded-full ${accentDot}`} />}
        {label}
      </div>
      <div className="mt-2 text-4xl font-bold text-neutral-900">{value}</div>
      {description && <div className="mt-2 text-sm text-neutral-500">{description}</div>}
    </Card>
  )
}

export type FunnelCell = { key: string; label: string; count: number; color: string }

export function StageFunnelStrip({ cells }: { cells: FunnelCell[] }) {
  return (
    <div className="mt-4 flex overflow-x-auto rounded-xl bg-neutral-50">
      {cells.map((c) => (
        <div key={c.key} className="flex min-w-[92px] flex-1 flex-col items-center gap-1 px-2 py-4">
          <div className="text-2xl font-bold text-neutral-900">{c.count}</div>
          <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {c.label}
          </div>
          <div className={`mt-1 h-1 w-10 rounded-full ${c.count > 0 ? c.color : 'bg-neutral-200'}`} />
        </div>
      ))}
    </div>
  )
}

export function ProgressBarRow({
  label,
  count,
  maxCount,
  detail,
  barColor = 'bg-red-600',
}: {
  label: string
  count: number
  maxCount: number
  detail: string
  barColor?: string
}) {
  const pct = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 6 : 0) : 0
  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="w-36 shrink-0 text-sm font-medium text-neutral-800">{label}</div>
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-neutral-100">
        <div
          className={`flex h-full items-center justify-end rounded-md ${barColor} px-2 transition-all`}
          style={{ width: `${pct}%` }}
        >
          {count > 0 && <span className="text-xs font-bold text-white">{count}</span>}
        </div>
      </div>
      <div className="w-28 shrink-0 text-right text-sm text-neutral-600">{detail}</div>
    </div>
  )
}
