import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Layers, FileText, Hammer, Wallet, AlertTriangle, Loader2,
  BarChart3, ChevronRight, TrendingUp, CheckCircle2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { reportingService } from '../services/reporting'
import { propertyService } from '../services/property'
import Modal from '../components/ui/Modal'
import type {
  DashboardStats, SalesMonthly, Project,
  SalesRecapReport, SalesProject, KprSummaryReport, ProjectKprRow,
  ConstructionProgressReport, ConstructionProject, FinanceSummary, KprDetailRow, UnitDetailRow,
} from '../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const monShort = (ym: string) => { const [y, m] = ym.split('-'); return `${monthLabels[Number(m) - 1] ?? m} '${y.slice(2)}` }

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

// ── Pemilih proyek per-seksi. pid='' = Semua Proyek (agregat). ──
function useProjectPick<T extends { project_id: string; project_name: string }>(projects: T[]) {
  const [pid, setPid] = useState('')   // default: Semua
  const sel = projects.find((p) => p.project_id === pid)
  return { pid, setPid, sel }
}

function ProjectSelect({ value, onChange, projects }: {
  value: string; onChange: (v: string) => void; projects: { project_id: string; project_name: string }[]
}) {
  return (
    <select className="input h-8 py-0 text-xs w-40" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{projects.length === 0 ? '— belum ada —' : 'Semua Proyek'}</option>
      {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
    </select>
  )
}

// Cincin progres (SVG) — dipakai di seksi Penjualan & Pembangunan.
function Ring({ pct, color = 'text-emerald-500', size = 60 }: { pct: number; color?: string; size?: number }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(Math.max(pct, 0), 100)
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-100" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
        className={color} strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-700 font-bold" style={{ fontSize: 13 }}>
        {Math.round(p)}%
      </text>
    </svg>
  )
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div>
      <p className={`font-display text-xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

// Gaya seksi = identitas NexistHub: label KAPITAL muted, tanpa prefiks huruf & kotak ikon warna.
function SectionShell({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="card p-4 sm:p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  )
}

// ═══════════ A. PENJUALAN ═══════════
type UnitBucket = 'all' | 'terjual' | 'belum'
const UNIT_BUCKET_TITLE: Record<UnitBucket, string> = {
  all: 'Semua Kavling', terjual: 'Kavling Terjual', belum: 'Kavling Belum Laku',
}
const UNIT_STATUS_CHIP: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700', booked: 'bg-amber-50 text-amber-700',
  sold: 'bg-blue-50 text-blue-700', handover: 'bg-purple-50 text-purple-700',
}

function SalesSection({ report }: { report: SalesRecapReport | null }) {
  const projects: SalesProject[] = report?.projects ?? []
  const { pid, setPid, sel } = useProjectPick(projects)
  const all = pid === ''
  const total = all ? projects.reduce((a, p) => a + p.units_total, 0) : (sel?.units_total ?? 0)
  const sold = all ? projects.reduce((a, p) => a + p.units_sold, 0) : (sel?.units_sold ?? 0)
  const belumLaku = total - sold
  const pct = total ? (sold / total) * 100 : 0
  const projLabel = all ? 'Semua Proyek' : (sel?.project_name ?? '')

  const [bucket, setBucket] = useState<UnitBucket | null>(null)
  const [rows, setRows] = useState<UnitDetailRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)

  function openDialog(b: UnitBucket) {
    if (projects.length === 0) return
    setBucket(b); setLoadingRows(true); setRows([])
    reportingService.unitsDetail(all ? undefined : pid)
      .then(setRows).catch(() => {}).finally(() => setLoadingRows(false))
  }
  const shownRows = bucket === 'all' || bucket == null ? rows : rows.filter((r) => r.bucket === bucket)

  return (
    <SectionShell title="Penjualan"
      right={<ProjectSelect value={pid} onChange={setPid} projects={projects} />}>
      {projects.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Belum ada proyek.</p> : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <ClickMetric label="Total Kavling" value={total} onClick={() => openDialog('all')} disabled={total === 0} />
            <ClickMetric label="Terjual" value={sold} accent="text-blue-600" onClick={() => openDialog('terjual')} disabled={sold === 0} />
            <ClickMetric label="Belum Laku" value={belumLaku} accent="text-amber-600" onClick={() => openDialog('belum')} disabled={belumLaku === 0} />
            <div className="flex items-center gap-3">
              <Ring pct={pct} color="text-emerald-500" />
              <div><p className="text-xs text-slate-500">Persentase Terjual</p><p className="text-xs text-slate-400">dari total kavling</p></div>
            </div>
          </div>

          <Modal open={bucket != null} onClose={() => setBucket(null)} title={bucket ? `${UNIT_BUCKET_TITLE[bucket]} — ${projLabel}` : ''} size="lg">
            {loadingRows ? (
              <div className="py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>
            ) : shownRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Tidak ada kavling pada kategori ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <p className="text-xs text-slate-400 mb-2">{shownRows.length} kavling</p>
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {all && <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Proyek</th>}
                      {['Unit', 'Tipe', 'Status', 'Cara Beli', 'Pembeli'].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>))}
                      {['Harga', 'Uang Masuk', 'Sisa'].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>))}
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shownRows.map((r) => (
                      <tr key={r.unit_id} className="hover:bg-slate-50">
                        {all && <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.project_name ?? '—'}</td>}
                        <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{r.unit_label}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.unit_type ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${UNIT_STATUS_CHIP[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{r.status_label}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.payment_type_label
                            ? <span className={`inline-flex items-center gap-1 text-xs ${r.payment_type === 'kpr' ? 'text-blue-600' : 'text-emerald-600'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${r.payment_type === 'kpr' ? 'bg-blue-500' : 'bg-emerald-500'}`} />{r.payment_type_label}
                              </span>
                            : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.client_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{fmt(r.price ?? undefined)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{r.client_id ? <span className="text-emerald-600">{fmt(r.cash_in ?? 0)}</span> : <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {r.client_id ? <span className={(r.remaining ?? 0) > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>{fmt(r.remaining ?? 0)}</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.client_id && (
                            <Link to={`/marketing/clients/${r.client_id}/payments`} className="text-brand-600 hover:underline text-xs inline-flex items-center gap-0.5">
                              Buka <ChevronRight size={12} />
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-xs font-semibold text-brand-700 mb-1">Progress Penjualan</p>
            <p className="text-[11px] text-slate-500 mb-2">Dari total {total} kavling, {sold} kavling telah terjual.</p>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-right text-[11px] font-semibold text-brand-600 mt-1">{pct.toFixed(0)}%</p>
          </div>
        </>
      )}
    </SectionShell>
  )
}

// ═══════════ B. DATA SPPR / KPR ═══════════
type KprBucket = 'all' | 'approved' | 'belum' | 'rejected'
const BUCKET_TITLE: Record<KprBucket, string> = {
  all: 'Semua Pengajuan SPPR', approved: 'SPPR Disetujui Bank',
  belum: 'SPPR Belum Disetujui', rejected: 'SPPR Ditolak',
}

// Angka yang bisa diklik → buka dialog daftar. Tanpa aksi bila value 0.
function ClickMetric({ label, value, accent, onClick, disabled }: {
  label: string; value: number; accent?: string; onClick: () => void; disabled: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`text-left rounded-lg -m-1 p-1 transition-colors ${disabled ? 'cursor-default' : 'hover:bg-slate-50 cursor-pointer'}`}>
      <p className={`font-display text-xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
        {label}{!disabled && <ChevronRight size={11} className="text-slate-300" />}
      </p>
    </button>
  )
}

// Agregat SPPR lintas proyek (untuk pilihan "Semua").
function aggregateKpr(projects: ProjectKprRow[]): Omit<ProjectKprRow, 'project_id' | 'project_name'> {
  const mMap = new Map<string, { label: string; count: number }>()
  let total = 0, app = 0, bel = 0, rej = 0
  for (const p of projects) {
    total += p.total_sppr; app += p.approved_bank; bel += p.not_approved; rej += p.rejected
    for (const m of p.methods) {
      const e = mMap.get(m.method) ?? { label: m.label, count: 0 }
      e.count += m.count; mMap.set(m.method, e)
    }
  }
  const mtot = [...mMap.values()].reduce((a, m) => a + m.count, 0)
  const methods = [...mMap.entries()]
    .map(([method, v]) => ({ method, label: v.label, count: v.count, pct: mtot ? Math.round((v.count / mtot) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count)
  return { total_sppr: total, approved_bank: app, not_approved: bel, rejected: rej, methods }
}

function KprSection({ report }: { report: KprSummaryReport | null }) {
  const projects: ProjectKprRow[] = report?.projects ?? []
  const { pid, setPid, sel } = useProjectPick(projects)
  const all = pid === ''
  const view = all ? aggregateKpr(projects) : sel
  const projLabel = all ? 'Semua Proyek' : (sel?.project_name ?? '')
  const [bucket, setBucket] = useState<KprBucket | null>(null)
  const [rows, setRows] = useState<KprDetailRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)

  function openDialog(b: KprBucket) {
    if (projects.length === 0) return
    setBucket(b); setLoadingRows(true); setRows([])
    reportingService.kprDetail(all ? undefined : pid)
      .then(setRows).catch(() => {}).finally(() => setLoadingRows(false))
  }
  const shownRows = bucket === 'all' || bucket == null ? rows : rows.filter((r) => r.bucket === bucket)

  return (
    <SectionShell title="Data SPPR / KPR"
      right={<ProjectSelect value={pid} onChange={setPid} projects={projects} />}>
      {projects.length === 0 || !view ? <p className="py-8 text-center text-sm text-slate-400">Belum ada proyek.</p> : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <ClickMetric label="Total SPPR" value={view.total_sppr} onClick={() => openDialog('all')} disabled={view.total_sppr === 0} />
            <ClickMetric label="Disetujui Bank" value={view.approved_bank} accent="text-emerald-600" onClick={() => openDialog('approved')} disabled={view.approved_bank === 0} />
            <ClickMetric label="Belum Disetujui" value={view.not_approved} accent="text-amber-600" onClick={() => openDialog('belum')} disabled={view.not_approved === 0} />
            <ClickMetric label="SPPR Ditolak" value={view.rejected} accent={view.rejected > 0 ? 'text-red-600' : undefined} onClick={() => openDialog('rejected')} disabled={view.rejected === 0} />
          </div>

          <Modal open={bucket != null} onClose={() => setBucket(null)} title={bucket ? `${BUCKET_TITLE[bucket]} — ${projLabel}` : ''} size="lg">
            {loadingRows ? (
              <div className="py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>
            ) : shownRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Tidak ada pengajuan pada kategori ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>{[...(all ? ['Proyek'] : []), 'Pembeli', 'Unit', 'Bank', 'Tahap', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shownRows.map((r) => (
                      <tr key={r.client_id} className="hover:bg-slate-50">
                        {all && <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.project_name ?? '—'}</td>}
                        <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{r.client_name}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.unit_label ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.bank_name ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.bucket === 'rejected' ? 'bg-red-50 text-red-700'
                              : r.bucket === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>{r.stage_label}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link to={`/marketing/clients/${r.client_id}/kpr`} className="text-brand-600 hover:underline text-xs inline-flex items-center gap-0.5">
                            Buka <ChevronRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>
          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-xs font-semibold text-brand-700 mb-2">Metode Pembayaran</p>
            {view.methods.length === 0 ? (
              <p className="text-[11px] text-slate-400">Belum ada pembeli.</p>
            ) : (
              <div className="space-y-1.5">
                {view.methods.map((m) => (
                  <div key={m.method} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${m.method === 'kpr' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                    <span className="text-slate-600 flex-1">{m.label}</span>
                    <span className="text-slate-500">{m.count} unit</span>
                    <span className="text-slate-400 w-10 text-right">{m.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </SectionShell>
  )
}

// ═══════════ C. PEMBANGUNAN ═══════════
// Agregat pembangunan lintas proyek (avg_percent = rata-rata TERBOBOT jumlah unit).
function aggregateConstr(projects: ConstructionProject[]) {
  let ut = 0, ns = 0, ip = 0, dn = 0, ot = 0, lu = 0, wsum = 0
  for (const p of projects) {
    ut += p.units_total; ns += p.not_started; ip += p.in_progress; dn += p.done
    ot += p.overdue_target; lu += p.late_update; wsum += p.avg_percent * p.units_total
  }
  return { units_total: ut, not_started: ns, in_progress: ip, done: dn, overdue_target: ot, late_update: lu, avg_percent: ut ? wsum / ut : 0 }
}

function ConstructionSection({ report }: { report: ConstructionProgressReport | null }) {
  const projects: ConstructionProject[] = report?.projects ?? []
  const { pid, setPid, sel } = useProjectPick(projects)
  const all = pid === ''
  const view = all ? aggregateConstr(projects) : sel

  return (
    <SectionShell title="Pembangunan"
      right={<ProjectSelect value={pid} onChange={setPid} projects={projects} />}>
      {projects.length === 0 || !view ? <p className="py-8 text-center text-sm text-slate-400">Belum ada proyek.</p> : (
        <>
          <p className="text-xs font-semibold text-slate-500 mb-2">Distribusi Progres Fisik</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5"><Metric label="Belum Mulai" value={view.not_started} /></div>
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5"><Metric label="Dalam Proses" value={view.in_progress} accent="text-amber-600" /></div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5"><Metric label="Selesai" value={view.done} accent="text-emerald-600" /></div>
          </div>

          <p className="text-xs font-semibold text-slate-500 mt-4 mb-2">Ketepatan Waktu</p>
          <div className="flex items-center gap-4">
            <Ring pct={view.avg_percent} color="text-brand-500" size={64} />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle size={13} className={view.overdue_target > 0 ? 'text-red-500' : 'text-slate-300'} />
                <span className="text-slate-600 flex-1">Lewat target</span>
                <span className={`font-semibold ${view.overdue_target > 0 ? 'text-red-600' : 'text-slate-500'}`}>{view.overdue_target} unit</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle size={13} className={view.late_update > 0 ? 'text-amber-500' : 'text-slate-300'} />
                <span className="text-slate-600 flex-1">Telat update &gt;7 hari</span>
                <span className={`font-semibold ${view.late_update > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{view.late_update} unit</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-0.5">Cincin = rata-rata progres fisik{all ? ' (semua proyek, terbobot unit)' : ' proyek ini'}.</p>
            </div>
          </div>
        </>
      )}
    </SectionShell>
  )
}

// ── Grafik penjualan 12 bulan (tak berubah) ──
function SalesChart() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [year, setYear] = useState('')
  const [data, setData] = useState<SalesMonthly[]>([])

  useEffect(() => { propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {}) }, [])
  useEffect(() => { reportingService.salesMonthly(projectId || undefined, year ? Number(year) : undefined).then(setData).catch(() => {}) }, [projectId, year])

  const max = Math.max(1, ...data.map((d) => d.value))
  const totalUnit = data.reduce((a, d) => a + d.count, 0)
  const totalVal = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><BarChart3 size={15} /> Penjualan {year ? `Tahun ${year}` : '12 Bulan Terakhir'}</h3>
        <div className="flex items-center gap-2">
          <select className="input h-8 py-0 text-xs w-44" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Semua proyek</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input h-8 py-0 text-xs w-28" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">12 bln terakhir</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="text-xs text-slate-400 whitespace-nowrap">{totalUnit} unit · {fmt(totalVal)}</span>
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Belum ada penjualan.</p>
      ) : (
        <div className="flex items-end gap-1.5 h-44">
          {data.map((d) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end"
              title={`${monShort(d.month)}: ${d.count} unit · ${fmt(d.value)}`}>
              <span className="text-[10px] text-slate-500 font-medium">{d.count || ''}</span>
              <div className="w-full max-w-[36px] rounded-t bg-brand-500 hover:bg-brand-600 transition-colors"
                style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0)}%` }} />
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{monShort(d.month)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">Angka di atas batang = jumlah unit terjual; tinggi batang = nilai penjualan (hover untuk detail).</p>
    </div>
  )
}

// KPI atas
function KpiCard({ icon: Icon, label, value, color, bg }: { icon: LucideIcon; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:shadow-soft transition-shadow">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}><Icon size={18} className={color} /></div>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold text-slate-900 truncate tracking-tight">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Strip Keuangan berfilter: Lokasi (proyek) + Bulan ──
// "Uang Masuk" ikut bulan terpilih; "Sisa Piutang" & "Total Terbayar" akumulatif (seluruh),
// keduanya tetap ikut filter lokasi. Semua angka dihitung ulang di backend saat filter berubah.
function monthOptions(): { value: string; label: string }[] {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${monthLabels[d.getMonth()]} ${d.getFullYear()}` }
  })
}

function FinanceCol({ icon: Icon, color, bg, label, value }: { icon: LucideIcon; color: string; bg: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}><Icon size={16} className={color} /></div>
      <div className="min-w-0">
        <p className="font-display text-lg font-bold text-slate-900 truncate tracking-tight">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function FinanceStrip() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const months = monthOptions()
  const [month, setMonth] = useState(months[0].value)
  const [data, setData] = useState<FinanceSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {}) }, [])
  useEffect(() => {
    setBusy(true)
    reportingService.financeSummary({ project_id: projectId || undefined, month })
      .then(setData).catch(() => {}).finally(() => setBusy(false))
  }, [projectId, month])

  const monthLabel = months.find((m) => m.value === month)?.label ?? month
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Wallet size={15} /> Keuangan</h3>
        <div className="flex items-center gap-2">
          <select className="input h-8 py-0 text-xs w-40" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Semua lokasi</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input h-8 py-0 text-xs w-32" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {busy && <Loader2 size={13} className="animate-spin text-slate-300" />}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FinanceCol icon={Wallet} color="text-emerald-500" bg="bg-emerald-50" label={`Uang Masuk · ${monthLabel}`} value={fmt(data?.cash_in)} />
        <FinanceCol icon={TrendingUp} color="text-amber-500" bg="bg-amber-50" label="Sisa Piutang · seluruh" value={fmt(data?.outstanding)} />
        <FinanceCol icon={CheckCircle2} color="text-blue-500" bg="bg-blue-50" label="Total Terbayar · seluruh" value={fmt(data?.total_paid)} />
        <FinanceCol icon={AlertTriangle} color="text-red-500" bg="bg-red-50" label="Termin Terlambat" value={String(data?.overdue_count ?? 0)} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [sales, setSales] = useState<SalesRecapReport | null>(null)
  const [kpr, setKpr] = useState<KprSummaryReport | null>(null)
  const [constr, setConstr] = useState<ConstructionProgressReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      reportingService.dashboard().then(setStats).catch(() => {}),
      reportingService.salesRecap().then(setSales).catch(() => {}),
      reportingService.kprSummary().then(setKpr).catch(() => {}),
      reportingService.constructionProgress().then(setConstr).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  const s = stats
  const pembangunanAktif = (constr?.projects ?? []).reduce((a, p) => a + p.in_progress, 0)

  return (
    <div className="space-y-6">
      {/* KPI atas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Total Client Terdaftar" value={s?.clients_total ?? 0} color="text-blue-500" bg="bg-blue-50" />
        <KpiCard icon={Layers} label="Total Kavling" value={s?.units_total ?? 0} color="text-emerald-500" bg="bg-emerald-50" />
        <KpiCard icon={FileText} label="SPPR Aktif" value={kpr?.sppr_active_total ?? 0} color="text-orange-500" bg="bg-orange-50" />
        <KpiCard icon={Hammer} label="Pembangunan Aktif" value={pembangunanAktif} color="text-purple-500" bg="bg-purple-50" />
      </div>

      {/* Strip keuangan berfilter (lokasi + bulan) */}
      <FinanceStrip />

      {/* 3 seksi utama */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SalesSection report={sales} />
        <KprSection report={kpr} />
        <ConstructionSection report={constr} />
      </div>

      {/* Unit tertahan tanpa data Pembeli */}
      {(s?.units_held_no_client ?? 0) > 0 && (
        <Link to="/marketing/booking-requests?tab=accepted" className="card p-4 flex items-center gap-4 border-amber-200 bg-amber-50/60 hover:bg-amber-50 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">{s?.units_held_no_client} unit ditahan tanpa data Pembeli</p>
            <p className="text-xs text-amber-700/80 mt-0.5">Biasanya dari booking agen yang sudah diterima — lanjutkan jadi Pembeli, atau lepas unitnya.</p>
          </div>
          <ChevronRight size={16} className="text-amber-500 shrink-0" />
        </Link>
      )}

      <SalesChart />

      {(s?.leads_total ?? 0) === 0 && (s?.units_total ?? 0) === 0 && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-2">Selamat datang di NexistHub 👋</h2>
          <p className="text-sm text-slate-500">
            Mulai dengan menambahkan <strong>Proyek &amp; Unit</strong> di menu Properti, lalu catat
            <strong> Lead</strong> dan <strong>Pembeli</strong> Anda.
          </p>
        </div>
      )}
    </div>
  )
}
