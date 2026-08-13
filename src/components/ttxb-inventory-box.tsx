import { Card } from '@/components/overview-ui'

type DailyEntry = { date: string; daysAgo: number; count: number }

export function TtxbInventoryBox({
  count,
  gmv,
  dailyEntries,
  backlogCount,
}: {
  count: number
  gmv: number
  dailyEntries: DailyEntry[]
  backlogCount: number
}) {
  return (
    <Card className="border-l-4 border-l-blue-600">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <span className="h-2 w-2 rounded-full bg-blue-600" />
        Inventory — TTXB Storage Area
      </div>
      <div className="mt-1 text-6xl font-bold text-neutral-900">{count}</div>
      <div className="text-xl font-semibold text-blue-700">GMV ₱{gmv.toLocaleString()}</div>
      <div className="text-sm text-neutral-500">TIDs inbounded (Scan 2), not yet repacked or stripped</div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            TIDs entered Storage — last 7 days
          </h4>
          <table className="mt-1 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-neutral-400">
                <th className="py-1 pr-4 font-semibold">Date</th>
                <th className="py-1 pr-4 font-semibold">Days in storage</th>
                <th className="py-1 font-semibold">TIDs entered</th>
              </tr>
            </thead>
            <tbody>
              {dailyEntries.map((d) => (
                <tr key={d.date} className="border-b border-neutral-200/60">
                  <td className="py-1 pr-4 text-neutral-600">{d.date}</td>
                  <td className="py-1 pr-4 text-neutral-600">{d.daysAgo}</td>
                  <td className="py-1 font-medium text-neutral-900">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            backlogCount > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          In Storage &gt; 8 days: {backlogCount} {backlogCount > 0 ? '(backlogged)' : '(none)'}
        </div>
      </div>
    </Card>
  )
}
