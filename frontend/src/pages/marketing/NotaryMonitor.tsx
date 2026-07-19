import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, Scale, Wallet, ClipboardList, Check, ChevronRight, ChevronDown, Landmark } from 'lucide-react'
import { taxService } from '../../services/tax'
import type {
  NotaryDebtResponse, NotaryDebtGroup, NotaryWorklistResponse, NotaryWorklistRow,
  BalikNamaStatus, NotaryHandoverEvent,
} from '../../types'

const fmtRp = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

const HANDOVER_LABEL: Record<NotaryHandoverEvent, string> = {
  ambil: 'Diambil dari arsip',
  serah_notaris: 'Di notaris',
  terima_pembeli: 'Diterima pembeli',
  tahan_bank: 'Di bank (agunan)',
  kembali_arsip: 'Kembali ke arsip',
}
const BALIK_LABEL: Record<BalikNamaStatus, string> = { belum: 'Belum', proses: 'Proses', selesai: 'Selesai' }

export default function NotaryMonitor() {
  const [tab, setTab] = useState<'hutang' | 'kerja'>('hutang')

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Scale size={20} className="text-brand-600" /> Pemantauan Notaris
        </h1>
        <p className="text-sm text-slate-500">Hutang jasa yang belum dibayar & pekerjaan pemberkasan yang masih tertahan di notaris.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'hutang'} onClick={() => setTab('hutang')} icon={<Wallet size={15} />} label="Hutang ke Notaris" />
        <TabButton active={tab === 'kerja'} onClick={() => setTab('kerja')} icon={<ClipboardList size={15} />} label="Pekerjaan Belum Selesai" />
      </div>

      {tab === 'hutang' ? <DebtsTab /> : <WorklistTab />}
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon} {label}
    </button>
  )
}

// ═══════════════════════ HUTANG ═══════════════════════
function DebtsTab() {
  const [data, setData] = useState<NotaryDebtResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true); setError('')
    taxService.notaryDebts().then(setData).catch(() => setError('Gagal memuat data hutang.')).finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) return <Loading />
  if (error) return <ErrorBox msg={error} />
  if (!data || data.groups.length === 0) return <Empty icon={<Wallet size={36} className="text-slate-300" />} title="Tidak ada hutang" sub="Semua biaya jasa notaris sudah dibayar." />

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-600 text-white px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-100">Total hutang ke semua notaris</p>
          <p className="text-2xl font-bold">{fmtRp(data.grand_total)}</p>
        </div>
        <Landmark size={32} className="text-brand-200" />
      </div>
      {data.groups.map((g) => <DebtGroupCard key={g.notary_id ?? 'none'} group={g} onPaid={load} />)}
    </div>
  )
}

function DebtGroupCard({ group, onPaid }: { group: NotaryDebtGroup; onPaid: () => void }) {
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function markPaid(feeId: string) {
    setBusyId(feeId)
    try { await taxService.markFeePaid(feeId); onPaid() } catch { /* noop */ } finally { setBusyId(null) }
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left">
        {open ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate">{group.notary_name}</p>
          <p className="text-xs text-slate-400">{group.count} tagihan belum dibayar</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-red-600">{fmtRp(group.total)}</p>
          <div className="flex gap-1 justify-end mt-0.5 text-[10px]">
            {group.aging_31_60 > 0 && <span className="rounded bg-amber-100 text-amber-700 px-1 py-0.5">31–60h: {fmtRp(group.aging_31_60)}</span>}
            {group.aging_60_plus > 0 && <span className="rounded bg-red-100 text-red-700 px-1 py-0.5">&gt;60h: {fmtRp(group.aging_60_plus)}</span>}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-slate-400">
              <tr>{['Pembeli', 'Unit', 'Uraian', 'Umur', 'Nominal', ''].map((h, i) => (
                <th key={i} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {group.fees.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{f.client_name}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{f.unit_label ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-500">{f.description}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {f.days_outstanding == null ? <span className="text-slate-400">—</span> : (
                      <span className={f.days_outstanding > 60 ? 'text-red-600 font-medium' : f.days_outstanding > 30 ? 'text-amber-600' : 'text-slate-500'}>
                        {f.days_outstanding} hari
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-800 whitespace-nowrap">{fmtRp(f.amount)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => markPaid(f.id)} disabled={busyId === f.id}
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
                      {busyId === f.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Tandai Lunas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════ PEKERJAAN BELUM SELESAI ═══════════════════════
function WorklistTab() {
  const [data, setData] = useState<NotaryWorklistResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [onlyMacet, setOnlyMacet] = useState(false)

  const load = (macet: boolean) => {
    setLoading(true); setError('')
    taxService.notaryWorklist({ only_macet: macet }).then(setData).catch(() => setError('Gagal memuat data pekerjaan.')).finally(() => setLoading(false))
  }
  useEffect(() => load(onlyMacet), [onlyMacet])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          {data && data.macet_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-xs font-medium">
              <AlertTriangle size={12} /> {data.macet_count} macet (&gt;15 hari)
            </span>
          )}
          {data && <span className="text-slate-400 text-xs">{data.total} pekerjaan belum selesai</span>}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={onlyMacet} onChange={(e) => setOnlyMacet(e.target.checked)} className="rounded border-slate-300" />
          Hanya yang macet
        </label>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox msg={error} /> : !data || data.rows.length === 0 ? (
        <Empty icon={<ClipboardList size={36} className="text-slate-300" />} title={onlyMacet ? 'Tidak ada yang macet' : 'Semua beres'} sub="Tidak ada pekerjaan notaris yang tertahan." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Pembeli', 'Unit / Proyek', 'Notaris', 'Tahap', 'Balik Nama', 'Dokumen Asli', 'Mandek', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => <WorklistRow key={r.client_id} row={r} onSaved={() => load(onlyMacet)} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function WorklistRow({ row, onSaved }: { row: NotaryWorklistRow; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)

  async function changeBalik(status: BalikNamaStatus) {
    setSaving(true)
    try { await taxService.updateBalikNama(row.client_id, status); onSaved() } catch { setSaving(false) }
  }

  return (
    <tr className={`align-top ${row.is_macet ? 'bg-red-50/40' : 'hover:bg-slate-50'}`}>
      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{row.client_name}</td>
      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{[row.unit_label, row.project_name].filter(Boolean).join(' · ') || '—'}</td>
      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{row.notary_name ?? '—'}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          row.stage === 'belum_serah' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
          {row.stage_label}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <select
          value={row.balik_nama_status}
          onChange={(e) => changeBalik(e.target.value as BalikNamaStatus)}
          disabled={saving}
          className={`input text-xs py-1 ${row.balik_nama_status === 'selesai' ? 'text-emerald-700' : row.balik_nama_status === 'proses' ? 'text-amber-700' : 'text-slate-600'}`}
        >
          {(['belum', 'proses', 'selesai'] as BalikNamaStatus[]).map((s) => <option key={s} value={s}>{BALIK_LABEL[s]}</option>)}
        </select>
      </td>
      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
        {row.last_handover_event ? (
          <>{HANDOVER_LABEL[row.last_handover_event]}<div className="text-xs text-slate-400">{fmtDate(row.last_handover_date)}</div></>
        ) : <span className="text-slate-400">Belum diserahkan</span>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {row.days_idle == null ? <span className="text-slate-400">—</span> : (
          <span className={row.is_macet ? 'text-red-600 font-semibold' : 'text-slate-500'}>
            {row.days_idle} hari{row.is_macet && <AlertTriangle size={12} className="inline ml-1 -mt-0.5" />}
          </span>
        )}
      </td>
      <td className="px-4 py-3">{saving && <Loader2 size={14} className="animate-spin text-slate-400" />}</td>
    </tr>
  )
}

// ── shared bits ──
const Loading = () => <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
const ErrorBox = ({ msg }: { msg: string }) => <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{msg}</div>
function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="card p-12 flex flex-col items-center justify-center text-center">
      <div className="mb-3">{icon}</div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-400">{sub}</p>
    </div>
  )
}
