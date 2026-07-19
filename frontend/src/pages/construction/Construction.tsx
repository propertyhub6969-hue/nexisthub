import { useEffect, useState, useCallback } from 'react'
import { today } from '../../utils/date'
import { Loader2, Pencil, HardHat, CheckCircle2, Plus, Trash2, Wallet, Camera, Image as ImageIcon, AlertTriangle, Printer, FileText, Eye, LayoutTemplate, Search } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import DateInput from '../../components/ui/DateInput'
import Modal from '../../components/ui/Modal'
import MoneyInput from '../../components/ui/MoneyInput'
import Pagination from '../../components/ui/Pagination'
import { constructionService } from '../../services/construction'
import { propertyService } from '../../services/property'
import { procurementService } from '../../services/procurement'
import { useAuth } from '../../context/AuthContext'
import { hasAnyRole } from '../../utils/access'
import { tenantLogoUrl } from '../../services/users'
import { printPengajuan } from '../../utils/pengajuan'
import type {
  Project, Unit, Vendor, UnitConstructionRow, ConstructionSummary, ConstructionStage, ConstructionUpsert,
  ContractorContract, ContractCreate, Opname, ProgressLog, PendingOpname, UpahResume, StageTemplate,
} from '../../types'

const REMINDER_DAYS = 7
function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  return days >= 0 ? days : 0
}
function isLate(r: UnitConstructionRow): boolean {
  if (r.stage === 'selesai') return false
  const ref = r.last_log_date ?? r.start_date
  if (!ref) return false
  const d = daysSince(ref)
  return d != null && d > REMINDER_DAYS
}

const KPR_STAGE_CFG: Record<string, { label: string; variant: 'gray' | 'yellow' | 'blue' | 'orange' | 'green' }> = {
  collect_berkas: { label: 'Collect Berkas', variant: 'gray' },
  berkas_masuk_bank: { label: 'Berkas di Bank', variant: 'yellow' },
  sp3k: { label: 'SP3K', variant: 'blue' },
  akad_kredit: { label: 'Akad Kredit', variant: 'orange' },
  pencairan: { label: 'Pencairan', variant: 'green' },
}

const STAGES: { key: ConstructionStage; label: string; variant: 'gray' | 'yellow' | 'blue' | 'orange' | 'green' }[] = [
  { key: 'persiapan', label: 'Persiapan', variant: 'gray' },
  { key: 'pondasi', label: 'Pondasi', variant: 'yellow' },
  { key: 'struktur', label: 'Struktur', variant: 'yellow' },
  { key: 'dinding', label: 'Dinding', variant: 'blue' },
  { key: 'atap', label: 'Atap', variant: 'blue' },
  { key: 'finishing', label: 'Finishing', variant: 'orange' },
  { key: 'selesai', label: 'Selesai', variant: 'green' },
]
const stageCfg = (s: ConstructionStage) => STAGES.find((x) => x.key === s) ?? STAGES[0]
const fmt = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

export default function Construction() {
  const [tab, setTab] = useState<'progres' | 'borongan' | 'resume'>('progres')
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // progres
  const [rows, setRows] = useState<UnitConstructionRow[]>([])
  const [summary, setSummary] = useState<ConstructionSummary | null>(null)
  const [pModalOpen, setPModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<UnitConstructionRow | null>(null)
  const [pForm, setPForm] = useState<ConstructionUpsert>({})
  const [progresSearch, setProgresSearch] = useState('')      // yang diketik
  const [progresSearchQ, setProgresSearchQ] = useState('')    // yang dikirim ke server (ditunda)
  const [progresPage, setProgresPage] = useState(1)
  const [progresTotal, setProgresTotal] = useState(0)
  const [progresPages, setProgresPages] = useState(1)
  const [logModal, setLogModal] = useState(false)
  const [logUnit, setLogUnit] = useState<UnitConstructionRow | null>(null)
  const [logList, setLogList] = useState<ProgressLog[]>([])
  const [logDate, setLogDate] = useState('')
  const [logStage, setLogStage] = useState<ConstructionStage | ''>('')
  const [logPercent, setLogPercent] = useState<number | undefined>(undefined)
  const [logNotes, setLogNotes] = useState('')
  const [logFile, setLogFile] = useState<File | null>(null)

  // borongan
  const [contracts, setContracts] = useState<ContractorContract[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [cModal, setCModal] = useState(false)
  const [cForm, setCForm] = useState<ContractCreate>({ unit_id: '', vendor_id: '', pengawas: '', title: '', total_value: 0 })
  const [cItems, setCItems] = useState<{ name: string; value: number }[]>([])
  const [cEditId, setCEditId] = useState<string | null>(null)
  const [sisaUpah, setSisaUpah] = useState<number | null>(null)
  const [rabUpah, setRabUpah] = useState<number | null>(null)
  const [sisaUpahLoading, setSisaUpahLoading] = useState(false)
  // template tahapan (reusable %+Rp)
  const [stageTemplates, setStageTemplates] = useState<StageTemplate[]>([])
  const [tplModal, setTplModal] = useState(false)
  const [tplEditId, setTplEditId] = useState<string | null>(null)
  const [tplForm, setTplForm] = useState<{ name: string; mode: 'rp' | 'percent'; lines: { name: string; value: number }[] }>({ name: '', mode: 'rp', lines: [] })
  const [opModal, setOpModal] = useState(false)
  const [opContract, setOpContract] = useState<ContractorContract | null>(null)
  const [opList, setOpList] = useState<Opname[]>([])
  const [opAmount, setOpAmount] = useState<number | undefined>(undefined)
  const [opDate, setOpDate] = useState('')
  const [opDesc, setOpDesc] = useState('')
  const [opWorkItem, setOpWorkItem] = useState('')

  // pengajuan pembayaran (level proyek)
  const { user } = useAuth()
  const canPay = hasAnyRole(user, ['owner', 'admin', 'manager'])
  const [pengModal, setPengModal] = useState(false)
  const [pending, setPending] = useState<PendingOpname[]>([])
  const [pengLoading, setPengLoading] = useState(false)
  const [payDate, setPayDate] = useState('')

  // resume per kavling
  const [upahResume, setUpahResume] = useState<UpahResume[]>([])
  const [resumeModal, setResumeModal] = useState(false)
  const [resumeUnit, setResumeUnit] = useState<{ label: string; status: { label: string; variant: 'gray' | 'yellow' | 'blue' | 'orange' | 'green' }; contracts: ContractorContract[] } | null>(null)

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => {
      setProjects(r.items); if (r.items.length) setProject((p) => p || r.items[0].id)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const loadProgres = useCallback(async (pid: string, q: string, pg: number) => {
    if (!pid) { setRows([]); setSummary(null); setProgresTotal(0); setProgresPages(1); return }
    const res = await constructionService.list(pid, { search: q || undefined, page: pg, size: 25 })
    setRows(res.rows); setSummary(res.summary); setProgresTotal(res.total); setProgresPages(res.pages)
  }, [])
  const loadBorongan = useCallback(async (pid: string) => {
    if (!pid) { setContracts([]); setRows([]); setUpahResume([]); return }
    const [c, u, v, con, ur, tpls] = await Promise.all([
      constructionService.listContracts(pid), propertyService.listUnits({ project_id: pid, size: 500 }),
      procurementService.listVendors(undefined, 'Kontraktor'), constructionService.list(pid, { size: 500 }), constructionService.getUpahResume(pid),
      constructionService.listStageTemplates(),
    ])
    setContracts(c); setUnits(u.items); setVendors(v); setRows(con.rows); setSummary(con.summary); setUpahResume(ur); setStageTemplates(tpls)
  }, [])
  // tunda 300ms setelah ketikan berhenti → tak membanjiri server tiap huruf
  useEffect(() => {
    const t = setTimeout(() => setProgresSearchQ(progresSearch.trim()), 300)
    return () => clearTimeout(t)
  }, [progresSearch])
  useEffect(() => { setProgresPage(1) }, [progresSearchQ])   // ganti kata kunci → balik ke halaman 1
  useEffect(() => { if (project && tab === 'progres') loadProgres(project, progresSearchQ, progresPage) }, [project, tab, progresSearchQ, progresPage, loadProgres])
  useEffect(() => { if (project && (tab === 'borongan' || tab === 'resume')) loadBorongan(project) }, [project, tab, loadBorongan])

  // Sisa upah (RAB kebocoran unit, kategori upah) — hanya saat kategori RAB opname = upah
  useEffect(() => {
    if (!cModal || cForm.rab_category !== 'upah' || !cForm.unit_id) { setSisaUpah(null); setRabUpah(null); return }
    let active = true; setSisaUpahLoading(true)
    procurementService.leakageDetail(cForm.unit_id)
      .then((d) => { if (!active) return; const r = d.rows.find((x) => x.category === 'upah'); setSisaUpah(r ? Number(r.selisih) : 0); setRabUpah(r ? Number(r.rab) : 0) })
      .catch(() => { if (active) { setSisaUpah(null); setRabUpah(null) } })
      .finally(() => { if (active) setSisaUpahLoading(false) })
    return () => { active = false }
  }, [cModal, cForm.unit_id, cForm.rab_category])

  // progres handlers
  function openEdit(r: UnitConstructionRow) {
    setEditRow(r); setPForm({ stage: r.stage, percent: r.percent, start_date: r.start_date ?? '', target_date: r.target_date ?? '', finish_date: r.finish_date ?? '', notes: r.notes ?? '' }); setPModalOpen(true)
  }
  async function submitProgres(e: React.FormEvent) {
    e.preventDefault(); if (!editRow) return; setSaving(true)
    try {
      const p = { ...pForm }; const rec = p as unknown as Record<string, unknown>
      ;['start_date', 'target_date', 'finish_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      await constructionService.upsert(editRow.unit_id, p); setPModalOpen(false); await loadProgres(project, progresSearchQ, progresPage)
    } catch { setError('Gagal menyimpan progres.') } finally { setSaving(false) }
  }
  async function openLog(r: UnitConstructionRow) {
    setLogUnit(r); setLogDate(''); setLogStage(''); setLogPercent(undefined); setLogNotes(''); setLogFile(null)
    setLogModal(true)
    setLogList(await constructionService.listProgressLogs(r.unit_id))
  }
  async function submitLog(e: React.FormEvent) {
    e.preventDefault(); if (!logUnit) return; setSaving(true)
    try {
      const fd = new FormData()
      if (logDate) fd.append('log_date', logDate)
      if (logStage) fd.append('stage', logStage)
      if (logPercent != null) fd.append('percent', String(logPercent))
      if (logNotes) fd.append('notes', logNotes)
      if (logFile) fd.append('file', logFile)
      await constructionService.addProgressLog(logUnit.unit_id, fd)
      setLogList(await constructionService.listProgressLogs(logUnit.unit_id))
      setLogDate(''); setLogStage(''); setLogPercent(undefined); setLogNotes(''); setLogFile(null)
      await loadProgres(project, progresSearchQ, progresPage)
    } catch { setError('Gagal mencatat log progres.') } finally { setSaving(false) }
  }
  async function delLog(id: string) {
    if (!logUnit) return
    try {
      await constructionService.deleteProgressLog(id)
      setLogList(await constructionService.listProgressLogs(logUnit.unit_id)); await loadProgres(project, progresSearchQ, progresPage)
    } catch { /* noop */ }
  }

  // borongan handlers
  function openCCreate() { setCEditId(null); setCForm({ unit_id: '', vendor_id: '', pengawas: '', rab_category: 'upah', title: '', total_value: 0 }); setCItems([]); setCModal(true) }
  function openCEdit(c: ContractorContract) { setCEditId(c.id); setCForm({ unit_id: c.unit_id, vendor_id: c.vendor_id ?? '', pengawas: c.pengawas ?? '', rab_category: c.rab_category ?? 'upah', title: c.title ?? '', total_value: c.total_value, notes: c.notes }); setCItems((c.items ?? []).map((w) => ({ name: w.name, value: Number(w.value) }))); setCModal(true) }
  const itemsTotal = cItems.reduce((s, it) => s + (Number(it.value) || 0), 0)
  function addStage(label: string) { setCItems((xs) => [...xs, { name: label, value: 0 }]) }
  function ambilDariRAB() { if (rabUpah != null) setCForm((f) => ({ ...f, total_value: rabUpah })) }
  function applyTemplate(tplId: string) {
    const tpl = stageTemplates.find((t) => t.id === tplId); if (!tpl) return
    if (tpl.mode === 'rp') {
      setCItems(tpl.lines.map((l) => ({ name: l.name, value: Number(l.value) })))
    } else {
      const base = itemsTotal || cForm.total_value || 0
      if (!base) { setError('Isi Nilai Borongan atau "Ambil dari RAB" dulu sebelum pakai template persen.'); return }
      let acc = 0
      const items = tpl.lines.map((l, i) => {
        if (i === tpl.lines.length - 1) return { name: l.name, value: Math.max(0, base - acc) }
        const v = Math.round(base * Number(l.value) / 100); acc += v
        return { name: l.name, value: v }
      })
      setCItems(items)
    }
  }
  // template tahapan CRUD
  function newTpl() { setTplEditId(null); setTplForm({ name: '', mode: 'rp', lines: [{ name: '', value: 0 }] }) }
  function openTplModal() { newTpl(); setTplModal(true) }
  function pickTpl(t: StageTemplate) { setTplEditId(t.id); setTplForm({ name: t.name, mode: t.mode, lines: t.lines.map((l) => ({ name: l.name, value: Number(l.value) })) }) }
  async function saveTpl() {
    const clean = tplForm.lines.filter((l) => l.name.trim())
    if (!tplForm.name.trim() || clean.length === 0) { setError('Nama & minimal 1 baris tahapan wajib diisi.'); return }
    setSaving(true)
    try {
      const payload = { name: tplForm.name, mode: tplForm.mode, lines: clean }
      if (tplEditId) await constructionService.updateStageTemplate(tplEditId, payload); else await constructionService.createStageTemplate(payload)
      setStageTemplates(await constructionService.listStageTemplates()); newTpl()
    } catch { setError('Gagal menyimpan template.') } finally { setSaving(false) }
  }
  async function delTpl(id: string) {
    if (!confirm('Hapus template tahapan ini?')) return
    try { await constructionService.deleteStageTemplate(id); setStageTemplates(await constructionService.listStageTemplates()); if (tplEditId === id) newTpl() } catch { setError('Gagal menghapus template.') }
  }
  async function submitContract(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const clean = cItems.filter((it) => it.name.trim())
      const p = { ...cForm, items: clean, total_value: clean.length ? itemsTotal : cForm.total_value }
      const rec = p as unknown as Record<string, unknown>
      ;['vendor_id', 'pengawas'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (cEditId) await constructionService.updateContract(cEditId, p); else await constructionService.createContract(p)
      setCModal(false); await loadBorongan(project)
    } catch { setError('Gagal menyimpan kontrak.') } finally { setSaving(false) }
  }
  async function delContract(id: string) {
    if (!confirm('Hapus kontrak borongan ini?')) return
    try { await constructionService.deleteContract(id); await loadBorongan(project) } catch { setError('Gagal menghapus.') }
  }
  async function openOpname(c: ContractorContract) {
    setOpContract(c); setOpAmount(undefined); setOpDate(''); setOpDesc(''); setOpWorkItem(''); setOpModal(true)
    setOpList(await constructionService.listOpname(c.id))
  }
  async function addOpname(e: React.FormEvent) {
    e.preventDefault(); if (!opContract || !opAmount) return; setSaving(true)
    try {
      const c = await constructionService.addOpname(opContract.id, { amount: opAmount, expense_date: opDate || undefined, description: opDesc || undefined, work_item_id: opWorkItem || undefined })
      setOpContract(c); setOpList(await constructionService.listOpname(opContract.id)); await loadBorongan(project)
      setOpAmount(undefined); setOpDate(''); setOpDesc(''); setOpWorkItem('')
    } catch { setError('Gagal mencatat opname.') } finally { setSaving(false) }
  }
  async function delOpname(id: string) {
    if (!opContract) return
    try { await constructionService.deleteOpname(id); setOpList(await constructionService.listOpname(opContract.id)); await loadBorongan(project) } catch { /* noop */ }
  }

  // pengajuan pembayaran handlers
  async function openPengajuan() {
    setPengModal(true); setPayDate(''); setPengLoading(true)
    try { setPending(await constructionService.getPendingOpname(project)) }
    catch { setError('Gagal memuat pengajuan.'); setPending([]) }
    finally { setPengLoading(false) }
  }
  function cetakPengajuan() {
    printPengajuan({
      project: projects.find((p) => p.id === project)?.name ?? '',
      company: user?.tenant_name ?? undefined,
      // Uraian di surat pengajuan = judul kontrak borongan (fallback ke keterangan opname bila judul kosong)
      rows: pending.map((r) => ({ unit_label: r.unit_label, contractor_name: r.contractor_name, work_item_name: r.work_item_name, expense_date: r.expense_date, description: r.title || r.description, amount: Number(r.amount) })),
      logoUrl: user?.tenant_slug ? tenantLogoUrl(user.tenant_slug) : undefined,
    })
  }
  async function tandaiDibayar() {
    if (pending.length === 0) return
    if (!confirm(`Tandai ${pending.length} opname sebagai DIBAYAR${payDate ? ' per ' + fmtDate(payDate) : ''}? Tindakan ini mencatat realisasi pembayaran keuangan.`)) return
    setSaving(true)
    try {
      await constructionService.markOpnamePaid(pending.map((r) => r.id), payDate || undefined)
      setPengModal(false); await loadBorongan(project)
    } catch { setError('Gagal menandai dibayar.') } finally { setSaving(false) }
  }

  const pengTotal = pending.reduce((s, r) => s + Number(r.amount || 0), 0)

  // Kartu ringkas tab Kontraktor (acuan upah) + kavling aktif (tgl selesai belum diisi)
  const upahContracts = contracts.filter((c) => (c.rab_category ?? 'upah') === 'upah')
  const upahNilai = upahContracts.reduce((s, c) => s + Number(c.total_value || 0), 0)
  const upahDiajukan = upahContracts.reduce((s, c) => s + Number(c.submitted || 0), 0)
  // Kavling aktif = pembangunan sudah DIMULAI (ada tgl mulai) tapi BELUM selesai — bukan sekadar jumlah unit
  const kavlingAktif = rows.filter((r) => r.start_date && !r.finish_date).length

  // Resume per kavling: agregasi kontrak borongan per unit + status konstruksi
  const statusByUnit = new Map(rows.map((r) => [r.unit_id, r]))
  const unitStatus = (unitId: string): { label: string; variant: 'gray' | 'yellow' | 'blue' | 'orange' | 'green' } => {
    const r = statusByUnit.get(unitId)
    if (!r) return { label: 'Aktif', variant: 'gray' }
    if (r.finish_date || r.stage === 'selesai') return { label: 'Selesai', variant: 'green' }
    const s = stageCfg(r.stage)
    return { label: s.label, variant: s.variant }
  }
  const resumeMap = new Map<string, { unit_id: string; unit_label: string; count: number; nilai: number; diajukan: number; dibayar: number; sisa: number }>()
  for (const c of contracts) {
    let g = resumeMap.get(c.unit_id)
    if (!g) { g = { unit_id: c.unit_id, unit_label: c.unit_label, count: 0, nilai: 0, diajukan: 0, dibayar: 0, sisa: 0 }; resumeMap.set(c.unit_id, g) }
    g.count += 1; g.nilai += Number(c.total_value || 0); g.diajukan += Number(c.submitted || 0); g.dibayar += Number(c.paid || 0); g.sisa += Number(c.remaining || 0)
  }
  function openResume(unitId: string) {
    const g = resumeMap.get(unitId); if (!g) return
    setResumeUnit({ label: g.unit_label, status: unitStatus(unitId), contracts: contracts.filter((c) => c.unit_id === unitId) })
    setResumeModal(true)
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200">
        {(['progres', 'borongan', 'resume'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'progres' ? 'Progres Pembangunan' : t === 'borongan' ? 'Kontraktor Borongan' : 'Resume per Kavling'}
          </button>
        ))}
      </div>

      <select className="input max-w-xs" value={project} onChange={(e) => setProject(e.target.value)}>
        <option value="">Pilih proyek...</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {tab === 'progres' && (
        <>
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="card p-4"><p className="text-xs text-slate-500">Total Unit</p><p className="text-lg font-semibold text-slate-900">{summary.total_units}</p></div>
              <div className="card p-4"><p className="text-xs text-slate-500">Rata-rata Progres</p><p className="text-lg font-semibold text-brand-600">{summary.avg_percent}%</p></div>
              <div className="card p-4"><p className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={12} /> Selesai</p><p className="text-lg font-semibold text-emerald-600">{summary.done_count} / {summary.total_units}</p></div>
            </div>
          )}
          {summary && summary.late_count > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={15} />
              {summary.late_count} unit belum update progres minggu ini (lewat {REMINDER_DAYS} hari).
            </div>
          )}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-900 flex items-center gap-2"><HardHat size={15} /> Progres per Unit</span>
              <div className="relative max-w-[220px] w-full">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input h-8 pl-8 text-sm" placeholder="Cari no. unit / blok…" list="construction-unit-suggest"
                  value={progresSearch} onChange={(e) => setProgresSearch(e.target.value)} />
                {/* autofill: saran dari unit yang sedang tampil (menyempit saat mengetik) */}
                <datalist id="construction-unit-suggest">
                  {rows.map((r) => <option key={r.unit_id} value={r.unit_label} />)}
                </datalist>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Unit', 'Tipe', 'Tahap', 'Progres', 'Mulai', 'Selesai', 'Status Berkas', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>))}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">
                      {!project ? 'Pilih proyek dulu.' : progresSearchQ ? `Tidak ada kavling cocok "${progresSearchQ}".` : 'Belum ada unit.'}
                    </td></tr>
                  ) : rows.map((r) => {
                    const s = stageCfg(r.stage)
                    const ks = r.kpr_stage ? KPR_STAGE_CFG[r.kpr_stage] : null
                    return (
                      <tr key={r.unit_id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">{r.unit_label}</td>
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.unit_type ?? '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Badge label={s.label} variant={s.variant} />
                          {isLate(r) && <p className="text-[11px] text-red-500 mt-0.5">Terlambat {daysSince(r.last_log_date ?? r.start_date)} hari</p>}
                        </td>
                        <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${r.percent}%` }} /></div><span className="text-xs text-slate-500">{r.percent}%</span></div></td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(r.start_date)}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(r.finish_date)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{ks ? <Badge label={ks.label} variant={ks.variant} /> : <span className="text-slate-400 text-xs">—</span>}</td>
                        <td className="px-4 py-2.5 text-right"><div className="flex items-center justify-end gap-3">
                          <button onClick={() => openLog(r)} className="text-slate-400 hover:text-brand-600" title="Log progres & foto"><Camera size={15} /></button>
                          <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-brand-600" title="Update"><Pencil size={15} /></button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={progresPage} pages={progresPages} total={progresTotal} onPage={setProgresPage} />
          </div>
        </>
      )}
      {tab === 'borongan' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4"><p className="text-xs text-slate-500">Total Nilai Upah</p><p className="text-lg font-semibold text-slate-900">{fmt(upahNilai)}</p></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Diajukan (Upah)</p><p className="text-lg font-semibold text-amber-600">{fmt(upahDiajukan)}</p></div>
            <div className="card p-4"><p className="text-xs text-slate-500 flex items-center gap-1"><HardHat size={12} /> Kavling Aktif</p><p className="text-lg font-semibold text-brand-600">{kavlingAktif}</p></div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary text-sm flex items-center gap-1" onClick={openTplModal}><LayoutTemplate size={14} /> Template Tahapan</button>
            <button className="btn-secondary text-sm flex items-center gap-1" onClick={openPengajuan} disabled={!project}><FileText size={14} /> Pengajuan Pembayaran</button>
            <button className="btn-primary text-sm flex items-center gap-1" onClick={openCCreate} disabled={!project}><Plus size={14} /> Kontrak Borongan</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Unit', 'Judul', 'Kontraktor', 'Pengawas', 'Nilai Borongan', 'Diajukan', 'Terbayar', 'Sisa', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {contracts.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada kontrak borongan.</td></tr>
                ) : contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.unit_label}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.title || '—'}{c.items && c.items.length > 0 && <span className="ml-2 text-xs text-slate-400">· {c.items.length} bagian</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.vendor_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.pengawas ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmt(c.total_value)}</td>
                    <td className={`px-4 py-2.5 ${Number(c.submitted) > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>{fmt(c.submitted)}</td>
                    <td className="px-4 py-2.5 text-emerald-600">{fmt(c.paid)}</td>
                    <td className={`px-4 py-2.5 font-medium ${Number(c.remaining) > 0 ? 'text-slate-600' : 'text-slate-500'}`}>{fmt(c.remaining)}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center justify-end gap-3">
                      <button onClick={() => openOpname(c)} className="text-slate-400 hover:text-brand-600" title="Opname mingguan"><Wallet size={15} /></button>
                      <button onClick={() => openCEdit(c)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => delContract(c.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'resume' && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900 flex items-center gap-2"><HardHat size={15} /> Resume Upah Tenaga Kerja per Kavling</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Kavling', 'Progres', 'Upah Minggu Ini', 'Dibayar', 'Diajukan', 'RAB Tenaga Kerja', 'Selisih', 'Status', ''].map((h, i) => (
              <th key={i} className={`px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider ${i >= 2 && i <= 6 ? 'text-right' : 'text-left'}`}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {upahResume.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">{project ? 'Belum ada realisasi upah / RAB tenaga kerja.' : 'Pilih proyek dulu.'}</td></tr>
              ) : upahResume.map((u) => (
                <tr key={u.unit_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{u.unit_label}</td>
                  <td className="px-4 py-2.5">
                    {u.progress_stage ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${u.progress_percent}%` }} /></div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{stageCfg(u.progress_stage).label} · {u.progress_percent}%</span>
                      </div>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmt(u.upah_minggu)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700 font-medium">{fmt(u.upah_dibayar)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {Number(u.upah_diajukan) > 0 ? <span className="text-amber-600 font-medium">{fmt(u.upah_diajukan)}</span> : <span className="text-slate-400">{fmt(u.upah_diajukan)}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmt(u.rab_tenaga_kerja)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${Number(u.selisih) > 0 ? 'text-red-600' : 'text-emerald-600'}`} title="Selisih dihitung dari total komitmen (dibayar + diajukan) terhadap RAB">{fmt(u.selisih)}</td>
                  <td className="px-4 py-2.5"><Badge label={u.status === 'aman' ? 'Aman' : 'Lewat'} variant={u.status === 'aman' ? 'green' : 'red'} /></td>
                  <td className="px-4 py-2.5 text-right">{resumeMap.has(u.unit_id) && <button onClick={() => openResume(u.unit_id)} className="text-slate-400 hover:text-brand-600" title="Lihat detail borongan"><Eye size={15} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Progres */}
      <Modal open={pModalOpen} onClose={() => setPModalOpen(false)} title={`Progres — ${editRow?.unit_label ?? ''}`}>
        <form onSubmit={submitProgres} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Tahap</label>
              <select className="input" value={pForm.stage} onChange={(e) => setPForm({ ...pForm, stage: e.target.value as ConstructionStage })}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select></div>
            <div><label className="label">Progres (%)</label><input className="input" type="number" min={0} max={100} value={pForm.percent ?? 0} onChange={(e) => setPForm({ ...pForm, percent: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Mulai</label><DateInput className="input" max={today()} value={pForm.start_date} onChange={(v) => setPForm({ ...pForm, start_date: v })} /></div>
            <div><label className="label">Target</label><DateInput className="input" value={pForm.target_date} onChange={(v) => setPForm({ ...pForm, target_date: v })} /></div>
            <div><label className="label">Selesai</label><DateInput className="input" max={today()} value={pForm.finish_date} onChange={(v) => setPForm({ ...pForm, finish_date: v })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setPModalOpen(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Kontrak */}
      <Modal open={cModal} onClose={() => setCModal(false)} title={cEditId ? 'Edit Kontrak Borongan' : 'Kontrak Borongan'}>
        <form onSubmit={submitContract} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Unit *</label>
              <select className="input" required value={cForm.unit_id} onChange={(e) => setCForm({ ...cForm, unit_id: e.target.value })} disabled={!!cEditId}>
                <option value="">Pilih unit...</option>{units.map((u) => <option key={u.id} value={u.id}>{[u.block, u.unit_number].filter(Boolean).join('-')}</option>)}
              </select></div>
            <div><label className="label">Kontraktor</label>
              <select className="input" value={cForm.vendor_id} onChange={(e) => setCForm({ ...cForm, vendor_id: e.target.value })}>
                <option value="">Pilih...</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Pengawas</label><input className="input" placeholder="Nama pengawas" value={cForm.pengawas} onChange={(e) => setCForm({ ...cForm, pengawas: e.target.value })} /></div>
            <div><label className="label">Kategori RAB (opname)</label>
              <select className="input" value={cForm.rab_category} onChange={(e) => setCForm({ ...cForm, rab_category: e.target.value as 'upah' | 'kontraktor' })}>
                <option value="upah">Upah (tukang/borongan sendiri)</option>
                <option value="kontraktor">Kontraktor (borongan pihak ketiga)</option>
              </select></div>
          </div>
          {cForm.rab_category === 'upah' && cForm.unit_id && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-amber-800">Sisa Upah <span className="text-xs text-amber-600">(RAB upah − realisasi)</span></span>
              <span className="font-semibold text-amber-700">{sisaUpahLoading ? '…' : sisaUpah == null ? '—' : fmt(sisaUpah)}</span>
            </div>
          )}
          <div><label className="label">Judul</label><input className="input" placeholder="Borongan A-01" value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} /></div>

          {/* Bagian pekerjaan (opsional) — bila diisi, Nilai Borongan = Σ bagian */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Bagian Pekerjaan <span className="text-xs font-normal text-slate-400">(opsional — pecah nilai per tahap)</span></label>
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setCItems((xs) => [...xs, { name: '', value: 0 }])}>+ Baris</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {cForm.rab_category === 'upah' && rabUpah != null && (
                <button type="button" onClick={ambilDariRAB} className="text-xs px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">Ambil dari RAB ({fmt(rabUpah)})</button>
              )}
              {stageTemplates.length > 0 && (
                <select className="input h-8 text-xs max-w-[220px]" value="" onChange={(e) => { if (e.target.value) applyTemplate(e.target.value) }}>
                  <option value="">Pakai Template…</option>
                  {stageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.mode === 'percent' ? '%' : 'Rp'})</option>)}
                </select>
              )}
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={openTplModal}>+ Kelola Template</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {STAGES.filter((s) => s.key !== 'selesai').map((s) => (
                <button key={s.key} type="button" onClick={() => addStage(s.label)} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">+ {s.label}</button>
              ))}
            </div>
            {cItems.length > 0 && (
              <div className="space-y-1.5">
                {cItems.map((it, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className="input flex-1" placeholder="Nama bagian (mis. Pondasi)" value={it.name} onChange={(e) => setCItems((xs) => xs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                    <div className="w-40"><MoneyInput value={it.value || undefined} onChange={(v) => setCItems((xs) => xs.map((x, j) => j === i ? { ...x, value: v ?? 0 } : x))} /></div>
                    <button type="button" onClick={() => setCItems((xs) => xs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                ))}
                <div className="flex justify-end text-sm pt-1 border-t border-slate-100"><span className="text-slate-500 mr-2">Σ Bagian:</span><span className="font-semibold text-slate-700">{fmt(itemsTotal)}</span></div>
              </div>
            )}
          </div>

          <div><label className="label">Nilai Borongan (Rp) *</label>
            {cItems.filter((it) => it.name.trim()).length > 0 ? (
              <input className="input bg-slate-50 text-slate-500" readOnly value={fmt(itemsTotal)} title="Otomatis = Σ nilai bagian pekerjaan" />
            ) : (
              <MoneyInput required value={cForm.total_value || undefined} onChange={(v) => setCForm({ ...cForm, total_value: v ?? 0 })} />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setCModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Opname */}
      <Modal open={opModal} onClose={() => setOpModal(false)} title={`Opname — ${opContract?.unit_label ?? ''}`}>
        {opContract && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="card p-2"><p className="text-xs text-slate-500">Nilai</p><p className="font-semibold">{fmt(opContract.total_value)}</p></div>
              <div className="card p-2"><p className="text-xs text-slate-500">Diajukan</p><p className="font-semibold text-amber-600">{fmt(opContract.submitted)}</p></div>
              <div className="card p-2"><p className="text-xs text-slate-500">Dibayar</p><p className="font-semibold text-emerald-600">{fmt(opContract.paid)}</p></div>
              <div className="card p-2"><p className="text-xs text-slate-500">Sisa</p><p className="font-semibold text-slate-600">{fmt(opContract.remaining)}</p></div>
            </div>
            {opContract.items && opContract.items.length > 0 && (
              <div className="card overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Bagian', 'Nilai', 'Diajukan', 'Dibayar', 'Sisa'].map((h, i) => (
                    <th key={i} className={`px-3 py-1.5 font-semibold text-slate-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>))}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {opContract.items.map((w) => (
                      <tr key={w.id}>
                        <td className="px-3 py-1.5 text-slate-700">{w.name}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">{fmt(w.value)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-600">{fmt(w.submitted)}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600">{fmt(w.paid)}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-700">{fmt(w.remaining)}</td>
                      </tr>
                    ))}
                    {(Number(opContract.unassigned_submitted) > 0 || Number(opContract.unassigned_paid) > 0) && (
                      <tr className="bg-slate-50/50">
                        <td className="px-3 py-1.5 text-slate-400 italic">Umum / tak terinci</td>
                        <td className="px-3 py-1.5 text-right text-slate-400">—</td>
                        <td className="px-3 py-1.5 text-right text-amber-600">{fmt(opContract.unassigned_submitted ?? 0)}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-600">{fmt(opContract.unassigned_paid ?? 0)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-400">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="space-y-1">
              {opList.length === 0 && <p className="text-xs text-slate-400">Belum ada opname.</p>}
              {opList.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5">
                  <span className="flex items-center gap-2">{o.description}
                    {o.work_item_name && <Badge label={o.work_item_name} variant="blue" />}
                    {o.is_paid ? <Badge label="Dibayar" variant="green" /> : <Badge label="Diajukan" variant="yellow" />}</span>
                  <span className="flex items-center gap-2"><span className="text-xs text-slate-400">{fmtDate(o.expense_date)}</span><span className="font-medium">{fmt(o.amount)}</span>
                    <button onClick={() => delOpname(o.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button></span>
                </div>
              ))}
            </div>
            <form onSubmit={addOpname} className="border-t border-slate-100 pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Nominal (Rp) *</label><MoneyInput required value={opAmount} onChange={(v) => setOpAmount(v)} /></div>
                <div><label className="label">Tanggal</label><DateInput className="input" max={today()} value={opDate} onChange={(v) => setOpDate(v)} /></div>
              </div>
              {opContract.items && opContract.items.length > 0 && (
                <div><label className="label">Untuk Bagian</label>
                  <select className="input" value={opWorkItem} onChange={(e) => setOpWorkItem(e.target.value)}>
                    <option value="">Umum / tak terinci</option>
                    {opContract.items.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select></div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1"><label className="label">Keterangan</label><input className="input" placeholder="Opname minggu ke-..." value={opDesc} onChange={(e) => setOpDesc(e.target.value)} /></div>
                <button type="submit" className="btn-primary text-sm h-[38px]" disabled={saving}>Catat</button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* Modal Log Progres Mingguan */}
      <Modal open={logModal} onClose={() => setLogModal(false)} title={`Log Progres — ${logUnit?.unit_label ?? ''}`}>
        {logUnit && (
          <div className="space-y-3">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {logList.length === 0 && <p className="text-xs text-slate-400">Belum ada log.</p>}
              {logList.map((l) => (
                <div key={l.id} className="flex items-start justify-between text-sm border-b border-slate-100 py-1.5">
                  <div>
                    <span className="text-slate-700">{fmtDate(l.log_date)}</span>
                    {l.stage && <span className="ml-2"><Badge label={stageCfg(l.stage).label} variant={stageCfg(l.stage).variant} /></span>}
                    {l.percent != null && <span className="ml-2 text-xs text-slate-500">{l.percent}%</span>}
                    {l.notes && <p className="text-xs text-slate-400">{l.notes}</p>}
                    {l.uploaded_by_name && <p className="text-[11px] text-slate-300">oleh {l.uploaded_by_name}</p>}
                  </div>
                  <span className="flex items-center gap-2 shrink-0">
                    {l.has_photo && <button type="button" onClick={() => constructionService.openProgressPhoto(l.id)} className="text-slate-400 hover:text-brand-600" title="Lihat foto"><ImageIcon size={14} /></button>}
                    <button onClick={() => delLog(l.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                  </span>
                </div>
              ))}
            </div>
            <form onSubmit={submitLog} className="border-t border-slate-100 pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Tanggal</label><DateInput className="input" max={today()} value={logDate} onChange={(v) => setLogDate(v)} /></div>
                <div><label className="label">Tahap</label>
                  <select className="input" value={logStage} onChange={(e) => setLogStage(e.target.value as ConstructionStage | '')}>
                    <option value="">Tak diubah</option>
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Progres (%)</label><input className="input" type="number" min={0} max={100} value={logPercent ?? ''} onChange={(e) => setLogPercent(e.target.value === '' ? undefined : Number(e.target.value))} /></div>
                <div><label className="label">Foto</label><input className="input" type="file" accept="image/*" onChange={(e) => setLogFile(e.target.files?.[0] ?? null)} /></div>
              </div>
              <div><label className="label">Catatan</label><input className="input" placeholder="Update minggu ke-..." value={logNotes} onChange={(e) => setLogNotes(e.target.value)} /></div>
              <div className="flex justify-end"><button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Catat Log</button></div>
            </form>
          </div>
        )}
      </Modal>

      {/* Modal Pengajuan Pembayaran (level proyek) */}
      <Modal open={pengModal} onClose={() => setPengModal(false)} title="Pengajuan Pembayaran Borongan">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Semua opname berstatus <b>Diajukan</b> (belum dibayar) di proyek ini. Cetak untuk diserahkan ke keuangan; setelah dibayar, tandai lunas.</p>
          {pengLoading ? (
            <div className="py-8 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>
          ) : pending.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Tidak ada opname yang menunggu dibayar.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
              {pending.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{r.unit_label}</span>
                    {r.contractor_name && <span className="text-slate-400"> · {r.contractor_name}</span>}
                    <p className="text-xs text-slate-400">{fmtDate(r.expense_date)} — {r.description}</p>
                  </div>
                  <span className="font-medium text-amber-600 shrink-0">{fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {pending.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-semibold">
              <span>Total Pengajuan ({pending.length} opname)</span>
              <span className="text-slate-900">{fmt(pengTotal)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm flex items-center gap-1" onClick={cetakPengajuan} disabled={pending.length === 0}><Printer size={14} /> Cetak</button>
            {canPay && (
              <div className="flex items-end gap-2">
                <div><label className="label">Tgl Dibayar</label><DateInput className="input h-[38px]" max={today()} value={payDate} onChange={(v) => setPayDate(v)} /></div>
                <button type="button" className="btn-primary text-sm h-[38px] flex items-center gap-2" onClick={tandaiDibayar} disabled={saving || pending.length === 0}>{saving && <Loader2 size={14} className="animate-spin" />}Tandai Dibayar</button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal Resume Detail per Kavling */}
      <Modal open={resumeModal} onClose={() => setResumeModal(false)} title={`Resume — ${resumeUnit?.label ?? ''}`}>
        {resumeUnit && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm"><span className="text-slate-500">Status konstruksi:</span><Badge label={resumeUnit.status.label} variant={resumeUnit.status.variant} /></div>
            {resumeUnit.contracts.map((c) => (
              <div key={c.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div>
                  <p className="font-medium text-slate-800">{c.title || 'Borongan'} <span className="text-xs font-normal text-slate-400">· {(c.rab_category ?? 'upah') === 'upah' ? 'Upah' : 'Kontraktor'}</span></p>
                  {c.vendor_name && <p className="text-xs text-slate-500">{c.vendor_name}</p>}
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="card p-2"><p className="text-slate-500">Nilai</p><p className="font-semibold">{fmt(c.total_value)}</p></div>
                  <div className="card p-2"><p className="text-slate-500">Diajukan</p><p className="font-semibold text-amber-600">{fmt(c.submitted)}</p></div>
                  <div className="card p-2"><p className="text-slate-500">Dibayar</p><p className="font-semibold text-emerald-600">{fmt(c.paid)}</p></div>
                  <div className="card p-2"><p className="text-slate-500">Sisa</p><p className="font-semibold text-slate-700">{fmt(c.remaining)}</p></div>
                </div>
                {c.items && c.items.length > 0 && (
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-100"><tr>{['Bagian', 'Nilai', 'Diajukan', 'Dibayar', 'Sisa'].map((h, i) => (
                      <th key={i} className={`py-1 ${i === 0 ? 'text-left' : 'text-right'} font-semibold text-slate-500`}>{h}</th>))}</tr></thead>
                    <tbody>
                      {c.items.map((w) => (
                        <tr key={w.id} className="border-b border-slate-50">
                          <td className="py-1 text-slate-700">{w.name}</td>
                          <td className="py-1 text-right text-slate-600">{fmt(w.value)}</td>
                          <td className="py-1 text-right text-amber-600">{fmt(w.submitted)}</td>
                          <td className="py-1 text-right text-emerald-600">{fmt(w.paid)}</td>
                          <td className="py-1 text-right font-medium text-slate-700">{fmt(w.remaining)}</td>
                        </tr>
                      ))}
                      {(Number(c.unassigned_submitted) > 0 || Number(c.unassigned_paid) > 0) && (
                        <tr>
                          <td className="py-1 text-slate-400 italic">Umum / tak terinci</td>
                          <td className="py-1 text-right text-slate-400">—</td>
                          <td className="py-1 text-right text-amber-600">{fmt(c.unassigned_submitted ?? 0)}</td>
                          <td className="py-1 text-right text-emerald-600">{fmt(c.unassigned_paid ?? 0)}</td>
                          <td className="py-1 text-right text-slate-400">—</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal Template Tahapan Borongan (CRUD, %+Rp) */}
      <Modal open={tplModal} onClose={() => setTplModal(false)} title="Template Tahapan Borongan">
        <div className="space-y-3">
          {stageTemplates.length > 0 && (
            <div className="space-y-1">
              {stageTemplates.map((t) => (
                <div key={t.id} className={`flex items-center justify-between text-sm border rounded-lg px-3 py-1.5 ${tplEditId === t.id ? 'border-brand-300 bg-brand-50' : 'border-slate-100'}`}>
                  <button type="button" onClick={() => pickTpl(t)} className="flex-1 text-left">
                    <span className="font-medium text-slate-800">{t.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{t.lines.length} tahap · {t.mode === 'percent' ? `Σ ${t.total}%` : fmt(t.total)}</span>
                  </button>
                  <button type="button" onClick={() => delTpl(t.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500">{tplEditId ? 'Edit Template' : 'Template Baru'}</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Nama</label><input className="input" placeholder="mis. Rumah Tipe 36" value={tplForm.name} onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="label">Mode</label>
                <select className="input" value={tplForm.mode} onChange={(e) => setTplForm((f) => ({ ...f, mode: e.target.value as 'rp' | 'percent' }))}>
                  <option value="rp">Rupiah (nilai tetap)</option>
                  <option value="percent">Persen (% dari total)</option>
                </select></div>
            </div>
            <div className="flex flex-wrap gap-1">
              {STAGES.filter((s) => s.key !== 'selesai').map((s) => (
                <button key={s.key} type="button" onClick={() => setTplForm((f) => ({ ...f, lines: [...f.lines, { name: s.label, value: 0 }] }))} className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">+ {s.label}</button>
              ))}
            </div>
            <div className="space-y-1.5">
              {tplForm.lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1" placeholder="Nama tahap (mis. Pondasi)" value={l.name} onChange={(e) => setTplForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} />
                  {tplForm.mode === 'percent' ? (
                    <div className="w-24 relative"><input className="input pr-6 text-right" type="number" min={0} value={l.value || ''} onChange={(e) => setTplForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x) }))} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span></div>
                  ) : (
                    <div className="w-40"><MoneyInput value={l.value || undefined} onChange={(v) => setTplForm((f) => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, value: v ?? 0 } : x) }))} /></div>
                  )}
                  <button type="button" onClick={() => setTplForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setTplForm((f) => ({ ...f, lines: [...f.lines, { name: '', value: 0 }] }))}>+ Baris</button>
                <span className="text-xs text-slate-400">Σ {tplForm.mode === 'percent' ? `${tplForm.lines.reduce((s, l) => s + (Number(l.value) || 0), 0)}%` : fmt(tplForm.lines.reduce((s, l) => s + (Number(l.value) || 0), 0))}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {tplEditId && <button type="button" className="btn-secondary text-sm" onClick={newTpl}>Batal Edit</button>}
              <button type="button" className="btn-primary text-sm flex items-center gap-2" disabled={saving} onClick={saveTpl}>{saving && <Loader2 size={14} className="animate-spin" />}{tplEditId ? 'Simpan Perubahan' : 'Tambah Template'}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
