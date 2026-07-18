import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, Printer, FileDown, AlertTriangle, Wallet, Building2, Receipt } from 'lucide-react'
import { reportingService } from '../../services/reporting'
import { printMonthlyTax, downloadMonthlyTaxCsv } from '../../utils/monthlyTax'
import NexistLogo from '../../components/ui/NexistLogo'
import type { MonthlyTaxReport } from '../../types'

const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${monthLabels[Number(m) - 1] ?? m} ${y}`
}
const categoryLabel: Record<string, string> = { subsidi: 'Subsidi', komersial: 'Komersial' }

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-medium uppercase tracking-wider truncate">{label}</span></div>
      <div className={`mt-2 text-base sm:text-lg font-semibold truncate ${accent ?? 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

// Halaman publik (tanpa login) — dibuka pihak luar (mis. konsultan pajak) lewat tautan bertoken.
export default function PublicMonthlyTax() {
  const { token = '' } = useParams()
  const [rep, setRep] = useState<MonthlyTaxReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    reportingService.publicMonthlyTax(token)
      .then(setRep)
      .catch((err) => setError(
        err?.response?.status === 404
          ? 'Tautan tidak ditemukan, sudah dicabut, atau sudah kedaluwarsa. Silakan hubungi pihak yang membagikan tautan ini.'
          : 'Gagal memuat laporan.'
      ))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-2">
        <NexistLogo size={24} />
        <span className="text-sm text-slate-400">Laporan Pajak Bulanan — akses tautan</span>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        {loading ? (
          <div className="card p-16 text-center text-slate-400"><Loader2 size={24} className="inline animate-spin" /></div>
        ) : error ? (
          <div className="card p-10 flex flex-col items-center text-center gap-2">
            <AlertTriangle size={32} className="text-amber-500" />
            <p className="text-sm text-slate-600 max-w-md">{error}</p>
          </div>
        ) : !rep ? null : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Rekap Pajak Bulanan (PPh)</h1>
                <p className="text-sm text-slate-500">Periode {fmtMonth(rep.month)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => printMonthlyTax(rep, fmtMonth(rep.month), 'Semua Proyek')}>
                  <Printer size={14} /> Print
                </button>
                <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={() => downloadMonthlyTaxCsv(rep, fmtMonth(rep.month))}>
                  <FileDown size={14} /> Excel (CSV)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard icon={<Receipt size={15} />} label="Jumlah Transaksi" value={String(rep.total_count)} />
              <StatCard icon={<Building2 size={15} />} label="Total Nilai AJB" value={fmtRp(rep.total_base_amount)} />
              <StatCard icon={<Wallet size={15} />} label="Total PPh" value={fmtRp(rep.total_amount)} accent="text-emerald-600" />
              <StatCard icon={<Wallet size={15} />} label="Total PPN" value={fmtRp(rep.total_ppn_amount)} accent="text-brand-600" />
              <StatCard icon={<Wallet size={15} />} label="Total BPHTB" value={fmtRp(rep.total_bphtb_amount)} accent="text-amber-600" />
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Nama', 'NIK KTP', 'Lokasi', 'No Unit', 'Jenis', 'Nilai AJB', 'Jumlah PPh', 'Jumlah PPN', 'Jumlah BPHTB', 'NTPN', 'No SHM', 'No PBB', 'KIR', 'Notaris'].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rep.rows.length === 0 ? (
                    <tr><td colSpan={14} className="px-4 py-8 text-center text-slate-400 text-sm">Tidak ada data PPh pada bulan ini.</td></tr>
                  ) : rep.rows.map((r) => (
                    <tr key={r.client_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.name}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.nik ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.location ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.unit_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.category ? categoryLabel[r.category] ?? r.category : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">{fmtRp(r.base_amount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">{fmtRp(r.amount)}</td>
                      <td className="px-4 py-3 text-right text-brand-600 whitespace-nowrap">{fmtRp(r.ppn_amount)}</td>
                      <td className="px-4 py-3 text-right text-amber-600 whitespace-nowrap">{fmtRp(r.bphtb_amount)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.ntpn ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.shm_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.pbb_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.sikumbang_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.notary_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {rep.rows.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                    <tr>
                      <td className="px-4 py-3" colSpan={5}>Total</td>
                      <td className="px-4 py-3 text-right">{fmtRp(rep.total_base_amount)}</td>
                      <td className="px-4 py-3 text-right">{fmtRp(rep.total_amount)}</td>
                      <td className="px-4 py-3 text-right">{fmtRp(rep.total_ppn_amount)}</td>
                      <td className="px-4 py-3 text-right">{fmtRp(rep.total_bphtb_amount)}</td>
                      <td className="px-4 py-3" colSpan={5}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
