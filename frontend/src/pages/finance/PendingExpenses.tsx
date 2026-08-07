import { useEffect, useState, useCallback } from 'react'
import { Loader2, Wallet, Zap, Droplets, HardHat, Receipt, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import DateInput from '../../components/ui/DateInput'
import { cashbookService } from '../../services/cashbook'
import type { PendingExpenseRow } from '../../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

const sourceCfg: Record<PendingExpenseRow['source'], { label: string; variant: 'blue' | 'yellow' | 'gray' }> = {
  utilitas: { label: 'Utilitas', variant: 'blue' },
  opname:   { label: 'Opname', variant: 'yellow' },
  biaya:    { label: 'Biaya', variant: 'gray' },
}

function SourceIcon({ row }: { row: PendingExpenseRow }) {
  if (row.utility_kind === 'pln') return <Zap size={15} className="text-amber-500" />
  if (row.utility_kind === 'pdam') return <Droplets size={15} className="text-blue-500" />
  if (row.source === 'opname') return <HardHat size={15} className="text-slate-400" />
  return <Receipt size={15} className="text-slate-400" />
}

/** Pengeluaran yang sudah diajukan tapi belum ditandai lunas keuangan.
 *  Selama belum ditandai, biaya BELUM masuk Buku Kas — jadi arus kas tetap
 *  mencerminkan uang yang benar-benar keluar. */
export default function PendingExpenses() {
  const [rows, setRows] = useState<PendingExpenseRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [payModal, setPayModal] = useState(false)
  const [paidDate, setPaidDate] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setError('')
    cashbookService.pendingExpenses()
      .then((d) => { setRows(d.rows); setTotal(Number(d.total_amount || 0)); setSel(new Set()) })
      .catch(() => setError('Gagal memuat daftar tagihan.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAll = () => setSel((s) => s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))
  const selTotal = rows.filter((r) => sel.has(r.id)).reduce((a, r) => a + Number(r.amount || 0), 0)

  async function submitPaid() {
    setSaving(true)
    try {
      await cashbookService.markExpensesPaid([...sel], paidDate || undefined)
      setPayModal(false); setPaidDate(''); load()
    } catch { setError('Gagal menandai lunas.') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Wallet size={20} className="text-brand-600" /> Biaya Menunggu Bayar
        </h1>
        <p className="text-sm text-slate-500">
          Pengeluaran yang sudah diajukan tim lapangan. Selama belum ditandai lunas, biaya ini
          <b> belum masuk Buku Kas</b> — tandai dengan tanggal bayar sebenarnya.
        </p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle2 size={36} className="mx-auto text-emerald-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">Tidak ada tagihan menunggu</p>
          <p className="text-xs text-slate-400">Semua pengeluaran yang diajukan sudah ditandai lunas.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="card p-4">
              <p className="text-xs text-slate-500">Tagihan Menunggu</p>
              <p className="font-display text-lg font-bold text-slate-900">{rows.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500">Total Nilai</p>
              <p className="font-display text-lg font-bold text-red-600">{fmt(total)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500">Dipilih</p>
              <p className="font-display text-lg font-bold text-brand-600">{sel.size > 0 ? fmt(selTotal) : '—'}</p>
            </div>
          </div>

          {sel.size > 0 && (
            <div className="rounded-lg bg-brand-50 border border-brand-200 px-4 py-2.5 flex items-center justify-between">
              <p className="text-sm text-brand-800"><b>{sel.size}</b> tagihan dipilih — {fmt(selTotal)}</p>
              <button onClick={() => setPayModal(true)} className="btn-primary text-sm">Tandai Lunas</button>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" className="rounded border-slate-300"
                      checked={sel.size === rows.length && rows.length > 0} onChange={toggleAll} />
                  </th>
                  {['Uraian', 'Proyek / Unit', 'Kategori', 'Sumber', 'Menunggu', 'Nominal'].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className={`hover:bg-slate-50 ${sel.has(r.id) ? 'bg-brand-50/40' : ''}`}>
                    <td className="px-4 py-2.5">
                      <input type="checkbox" className="rounded border-slate-300"
                        checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <SourceIcon row={r} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{r.description}</p>
                          {r.applied_date && (
                            <p className="text-[11px] text-slate-400">
                              Diajukan {fmtDate(r.applied_date)}
                              {r.installed_date && ` · Terpasang ${fmtDate(r.installed_date)}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {r.project_name ?? '—'}{r.unit_label ? ` · ${r.unit_label}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.category_label}</td>
                    <td className="px-4 py-2.5"><Badge variant={sourceCfg[r.source].variant} label={sourceCfg[r.source].label} /></td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.days_waiting == null ? <span className="text-slate-400">—</span> : (
                        <span className={`inline-flex items-center gap-1 ${
                          r.days_waiting > 30 ? 'text-red-600 font-medium' : r.days_waiting > 14 ? 'text-amber-600' : 'text-slate-500'
                        }`}>
                          {r.days_waiting > 30 && <AlertTriangle size={12} />}
                          {r.days_waiting} hari
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Tandai Lunas">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <b>{sel.size}</b> tagihan senilai <b>{fmt(selTotal)}</b> akan dicatat sebagai kas keluar di Buku Kas.
          </p>
          <div>
            <label className="label">Tanggal Bayar</label>
            <DateInput value={paidDate} onChange={setPaidDate} />
            <p className="text-xs text-slate-400 mt-1">Kosongkan = hari ini. Isi tanggal transfer sebenarnya bila berbeda dari tanggal pemasangan.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary text-sm" onClick={() => setPayModal(false)}>Batal</button>
            <button className="btn-primary text-sm flex items-center gap-2" disabled={saving} onClick={submitPaid}>
              {saving && <Loader2 size={14} className="animate-spin" />} Tandai Lunas
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
