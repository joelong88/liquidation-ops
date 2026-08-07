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
    <div className="rounded-md border-2 border-blue-300 bg-blue-50 p-4">
      <div className="text-sm font-semibold uppercase tracking-wide text-blue-800">
        Inventory — TTXB Storage Area
      </div>
      <div className="text-6xl font-black text-blue-900">{count}</div>
      <div className="text-xl font-semibold text-blue-800">GMV ₱{gmv.toLocaleString()}</div>
      <div className="text-sm text-blue-800/70">TIDs inbounded (Scan 2), not yet repacked or stripped</div>

      <div className="mt-3 flex flex-col gap-3 rounded-md border border-blue-200 bg-white p-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            TIDs entered Storage — last 7 days
          </h4>
          <table className="mt-1 w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-1 pr-4 font-semibold">Date</th>
                <th className="py-1 pr-4 font-semibold">Days in storage</th>
                <th className="py-1 font-semibold">TIDs entered</th>
              </tr>
            </thead>
            <tbody>
              {dailyEntries.map((d) => (
                <tr key={d.date} className="border-b border-blue-50">
                  <td className="py-1 pr-4 text-neutral-600">{d.date}</td>
                  <td className="py-1 pr-4 text-neutral-600">{d.daysAgo}</td>
                  <td className="py-1 font-medium">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            backlogCount > 0
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          In Storage &gt; 8 days: {backlogCount} {backlogCount > 0 ? '(backlogged)' : '(none)'}
        </div>
      </div>
    </div>
  )
}
