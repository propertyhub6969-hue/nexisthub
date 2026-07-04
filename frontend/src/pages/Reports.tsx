import { useEffect, useState } from 'react'
import { Loader2, Landmark, TrendingDown, CheckCircle2, XCircle, FileStack } from 'lucide-react'
import { reportingService } from '../services/reporting'
import type { KprRejectionReport } from '../types'

function rateColor(rate: number): string {
  if (rate >= 40) return 'text-red-600'
  if (rate >= 20) return 'text-amber-600'
  return 'text-emerald-600'
}

function rateBar(rate: number): string {
  if (rate >= 40) return 'bg-red-500'
  if (rate >= 20) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-medium uppercase tracking-wider">{label}</span></div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </div>
  )
}

export default function Reports() {
  const [report, setReport] = useState<KprRejectionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.kprRejection()
      .then(setReport)
      .catch(() => setError('Gagal memuat laporan.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Rejection-Rate KPR per Bank</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Persentase pengajuan KPR yang ditolak per bank penyalur — bantu pilih bank dengan tingkat persetujuan tertinggi.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : !report || report.total === 0 ? (
        <div className="card p-12 flex flex-col items-center justify-center text-center">
          <FileStack size={40} className="text-slate-300 mb-4" />
          <h3 className="text-base font-semibold text-slate-700 mb-1">Belum ada pengajuan KPR</h3>
          <p className="text-sm text-slate-400">Laporan akan muncul setelah ada pengajuan KPR ke bank.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={<FileStack size={15} />} label="Total Pengajuan" value={String(report.total)} />
            <StatCard icon={<CheckCircle2 size={15} />} label="Disetujui" value={String(report.approved)} hint={`${report.in_process} masih proses`} />
            <StatCard icon={<XCircle size={15} />} label="Ditolak" value={String(report.rejected)} />
            <StatCard icon={<TrendingDown size={15} />} label="Rejection Rate" value={`${report.rejection_rate}%`} hint="seluruh bank" />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Bank', 'Total', 'Disetujui', 'Proses', 'Ditolak', 'Rejection Rate'].map((h, i) => (
                    <th key={i} className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-left' : 'text-center'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.banks.map((b) => (
                  <tr key={b.bank_id ?? 'none'} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <Landmark size={14} className="text-slate-400" />{b.bank_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{b.total}</td>
                    <td className="px-4 py-3 text-center text-emerald-600">{b.approved}</td>
                    <td className="px-4 py-3 text-center text-slate-400">{b.in_process}</td>
                    <td className="px-4 py-3 text-center text-red-600">{b.rejected}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${rateBar(b.rejection_rate)}`} style={{ width: `${Math.min(b.rejection_rate, 100)}%` }} />
                        </div>
                        <span className={`w-12 text-right font-semibold ${rateColor(b.rejection_rate)}`}>{b.rejection_rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
