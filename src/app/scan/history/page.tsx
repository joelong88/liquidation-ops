import { getCurrentProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { BackToDashboard } from '@/components/back-to-dashboard'
import { formatDateTime } from '@/lib/format-date'
import { CsvDownloadButton } from '@/app/scan/history/csv-download-button'
import { TidLocationChecker } from '@/app/scan/history/tid-location-checker'
import { OverviewCanvas, Card, CardHeader } from '@/components/overview-ui'

// stage_event only ever logs these four stages — mapped to the operator-facing scan
// number from the /ops station list, since raw stage codes don't mean anything to Joel.
const STAGE_TO_SCAN: Record<string, string> = {
  RECEIVED: '1. First Scan',
  IN_STORAGE: '2. Inbound → TTXB Storage',
  REPACKED: '3. Repack (TTXB Storage)',
  IN_LIQUIDATION_AREA: '5. New Arrival (Liquidation Area)',
}

const SACK_ACTION_TO_SCAN: Record<string, string> = {
  OPENED: 'Sack opened',
  CLOSED: 'Sack closed',
  STRIPPED: '4/6. Strip',
  HOLD_FORCED: 'Force-success',
  REPACK_OPENED: '3. Repack (pulled from sack)',
}

const PALLET_ACTION_TO_SCAN: Record<string, string> = {
  SACK_ADDED: '4/6. Consolidate (sack added)',
  TID_ADDED: '5. Consolidate (NO-AWB added)',
  CLOSED: 'Pallet closed',
  ENDORSED: '7. Endorsement',
  OUTGOING: '8. Outbound',
}

type Row = {
  id: string
  idLabel: string
  level: 'TID' | 'Sack' | 'Pallet'
  scan: string
  result: string | null
  scannedBy: string | null
  eventTs: string
}

export default async function ScanHistoryPage() {
  const profile = await getCurrentProfile()

  if (!profile || !['warehouse_ops', 'recovery_team', 'owner'].includes(profile.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-sm text-neutral-600">
          This page is for warehouse ops and recovery team accounts.
        </p>
      </main>
    )
  }

  const supabase = await createClient()
  const [{ data: stageEvents }, { data: sackEvents }, { data: palletEvents }, { data: profiles }] =
    await Promise.all([
      supabase
        .from('stage_event')
        .select('event_id, tid, stage, event_ts, scanned_by, parcel(resolved_output_bin)')
        .order('event_ts', { ascending: false })
        .limit(60),
      supabase
        .from('sack_event')
        .select('event_id, action, event_ts, scanned_by, sack:sack_id(sack_code, pallet:pallet_id(pallet_code))')
        .order('event_ts', { ascending: false })
        .limit(60),
      supabase
        .from('pallet_event')
        .select('event_id, action, event_ts, scanned_by, pallet:pallet_id(pallet_code)')
        .order('event_ts', { ascending: false })
        .limit(60),
      supabase.from('profile').select('id, email'),
    ])

  // scanned_by references auth.users directly (not profile), so there's no FK
  // PostgREST can embed through — join by hand instead.
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]))

  const rows: Row[] = [
    ...(stageEvents ?? []).map((e) => {
      const bin = (e.parcel as unknown as { resolved_output_bin: string | null } | null)?.resolved_output_bin
      return {
        id: `tid-${e.event_id}`,
        idLabel: e.tid,
        level: 'TID' as const,
        scan: STAGE_TO_SCAN[e.stage] ?? e.stage,
        result: e.stage === 'RECEIVED' ? (bin ? `Bin ${bin}` : '—') : null,
        scannedBy: e.scanned_by,
        eventTs: e.event_ts,
      }
    }),
    ...(sackEvents ?? []).map((e) => {
      const sack = e.sack as unknown as { sack_code: string; pallet: { pallet_code: string } | null } | null
      const palletCode = sack?.pallet?.pallet_code
      return {
        id: `sack-${e.event_id}`,
        idLabel: sack?.sack_code ?? '—',
        level: 'Sack' as const,
        scan: SACK_ACTION_TO_SCAN[e.action] ?? e.action,
        result: e.action === 'STRIPPED' ? (palletCode ? `Pallet ${palletCode}` : 'Not yet on pallet') : null,
        scannedBy: e.scanned_by,
        eventTs: e.event_ts,
      }
    }),
    ...(palletEvents ?? []).map((e) => ({
      id: `pallet-${e.event_id}`,
      idLabel: (e.pallet as unknown as { pallet_code: string } | null)?.pallet_code ?? '—',
      level: 'Pallet' as const,
      scan: PALLET_ACTION_TO_SCAN[e.action] ?? e.action,
      result: null,
      scannedBy: e.scanned_by,
      eventTs: e.event_ts,
    })),
  ]
    .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime())
    .slice(0, 80)

  return (
    <main className="min-h-screen p-6">
      <OverviewCanvas>
        <div>
          <BackToDashboard />
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">Recent scans</h1>
        </div>

        <Card>
          <CardHeader title="Locate a parcel" subtitle="e.g. shipper pull-out requests" />
          <div className="mt-3">
            <TidLocationChecker />
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-neutral-900">{rows.length} events</h3>
              <span className="text-sm text-neutral-500">most recent first</span>
            </div>
            <CsvDownloadButton
              rows={rows.map((r) => ({
                level: r.level,
                idLabel: r.idLabel,
                scan: r.scan,
                result: r.result,
                scannedByEmail: r.scannedBy ? (emailById.get(r.scannedBy) ?? 'Unknown account') : null,
                eventTs: r.eventTs,
              }))}
            />
          </div>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Level</th>
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Scan</th>
                <th className="py-2 pr-4">Result</th>
                <th className="py-2 pr-4">Scanned by</th>
                <th className="py-2">When (SGT)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-50">
                  <td className="py-2 pr-4">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      {r.level}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono">{r.idLabel}</td>
                  <td className="py-2 pr-4">{r.scan}</td>
                  <td className="py-2 pr-4 font-medium">{r.result ?? '—'}</td>
                  <td className="py-2 pr-4">
                    {r.scannedBy ? (emailById.get(r.scannedBy) ?? 'Unknown account') : '—'}
                  </td>
                  <td className="py-2">{formatDateTime(r.eventTs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="mt-2 text-sm text-neutral-400">No scans recorded yet.</p>}
        </Card>
      </OverviewCanvas>
    </main>
  )
}
