import { useEffect, useState, useCallback, useRef } from 'react'
import { today } from '../../utils/date'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2, Pencil, Loader2, Wallet, Scale, Landmark, Columns3, MoreVertical } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import DateInput from '../../components/ui/DateInput'
import MoneyInput from '../../components/ui/MoneyInput'
import Modal from '../../components/ui/Modal'
import SignaturePad from '../../components/ui/SignaturePad'
import Pagination from '../../components/ui/Pagination'
import { marketingService } from '../../services/marketing'
import { propertyService } from '../../services/property'
import { authService } from '../../services/auth'
import type { Client, ClientCreate, ClientStatus, ClientPaymentType, KprStage, Project, Unit, UserResponse } from '../../types'

// Kolom yang bisa disembunyikan lewat tombol "Kolom" (Nama/Status/Aksi selalu tampil)
type ToggleColKey = 'tanggal' | 'phone' | 'proyek' | 'unit' | 'harga' | 'terbayar' | 'piutang' | 'cara_beli' | 'kpr_stage'
interface ColDef { key: ToggleColKey | 'nama' | 'status' | 'aksi'; label: string; toggleable: boolean }
const ALL_COLUMNS: ColDef[] = [
  { key: 'tanggal', label: 'Tanggal', toggleable: true },
  { key: 'nama', label: 'Nama Pembeli', toggleable: false },
  { key: 'phone', label: 'No. HP', toggleable: true },
  { key: 'proyek', label: 'Proyek', toggleable: true },
  { key: 'unit', label: 'No. Unit', toggleable: true },
  { key: 'harga', label: 'Harga Jual', toggleable: true },
  { key: 'terbayar', label: 'Total Terbayar', toggleable: true },
  { key: 'piutang', label: 'Sisa Piutang', toggleable: true },
  { key: 'cara_beli', label: 'Cara Beli', toggleable: true },
  { key: 'kpr_stage', label: 'Status Berkas KPR', toggleable: true },
  { key: 'status', label: 'Status Bayar', toggleable: false },
  { key: 'aksi', label: '', toggleable: false },
]
const DEFAULT_VISIBLE_COLS: Record<ToggleColKey, boolean> = {
  tanggal: true, phone: true, proyek: true, unit: true, harga: true, terbayar: true, piutang: true, cara_beli: true, kpr_stage: true,
}
const COLS_STORAGE_KEY = 'nexisthub_clients_visible_cols'
function loadVisibleCols(): Record<ToggleColKey, boolean> {
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY)
    if (raw) return { ...DEFAULT_VISIBLE_COLS, ...JSON.parse(raw) }
  } catch { /* abaikan, pakai default */ }
  return DEFAULT_VISIBLE_COLS
}

const statusConfig: Record<ClientStatus, { label: string; variant: 'green' | 'blue' | 'gray' }> = {
  active:    { label: 'Aktif',    variant: 'green' },
  completed: { label: 'Selesai',  variant: 'blue' },
  inactive:  { label: 'Nonaktif', variant: 'gray' },
}

const paymentTypeConfig: Record<ClientPaymentType, { label: string; variant: 'blue' | 'gray' }> = {
  cash: { label: 'Cash', variant: 'gray' },
  kpr:  { label: 'KPR',  variant: 'blue' },
}

const kprStageLabel: Record<KprStage, string> = {
  collect_berkas: 'Collect Berkas',
  berkas_masuk_bank: 'Berkas di Bank',
  sp3k: 'SP3K',
  akad_kredit: 'Akad Kredit',
  pencairan: 'Pencairan',
}

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const emptyForm: ClientCreate = {
  full_name: '', phone: '', nik: '', address: '', project_id: '', unit_id: '',
  contract_value: undefined, contract_date: '', payment_type: undefined, promo: '', signature: '', status: 'active',
}

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [unitsByProject, setUnitsByProject] = useState<Record<string, Unit[]>>({})  // lazy per-proyek
  const [me, setMe] = useState<UserResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ClientCreate>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formMarketingName, setFormMarketingName] = useState('')

  const [visibleCols, setVisibleCols] = useState<Record<ToggleColKey, boolean>>(loadVisibleCols)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const [projectFilter, setProjectFilter] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [unitFilterQuery, setUnitFilterQuery] = useState('')   // teks yg diketik di filter unit (autofill)
  const [unitFormQuery, setUnitFormQuery] = useState('')       // teks yg diketik di form unit (autofill)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)

  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name
  const unitLabel = (u?: Unit) => u ? [u.block, u.unit_number].filter(Boolean).join('-') : undefined
  const unitsFor = (pid?: string) => (pid && unitsByProject[pid]) || []
  const unitNumberById = (id?: string) => unitLabel(Object.values(unitsByProject).flat().find((u) => u.id === id))
  const formUnits = unitsFor(form.project_id)
  const filterUnits = unitsFor(projectFilter)

  useEffect(() => {
    localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(visibleCols))
  }, [visibleCols])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false)
      if (!(e.target as HTMLElement).closest('[data-action-menu-root]')) setActionMenuId(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function toggleCol(key: ToggleColKey) {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const load = useCallback(async (term: string, pg: number, proj: string, unit: string) => {
    setLoading(true); setError('')
    try {
      const res = await marketingService.listClients({
        search: term || undefined, project_id: proj || undefined, unit_id: unit || undefined,
        page: pg, size: 25,
      })
      setClients(res.items); setTotal(res.total); setPages(res.pages)
    } catch { setError('Gagal memuat data pembeli.') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    propertyService.listProjects({ size: 500 }).then((r) => setProjects(r.items)).catch(() => {})
    authService.me().then(setMe).catch(() => {})
  }, [])

  // Lazy: muat unit hanya untuk proyek yang dipilih (filter & form), di-cache per proyek
  useEffect(() => {
    const pid = projectFilter
    if (!pid || unitsByProject[pid]) return
    propertyService.listUnits({ project_id: pid, size: 500 }).then((r) => setUnitsByProject((p) => ({ ...p, [pid]: r.items }))).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter])
  useEffect(() => {
    const pid = form.project_id
    if (!pid || unitsByProject[pid]) return
    propertyService.listUnits({ project_id: pid, size: 500 }).then((r) => setUnitsByProject((p) => ({ ...p, [pid]: r.items }))).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.project_id])

  const firstLoad = useRef(true)
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      load(search, page, projectFilter, unitFilter)
      return
    }
    const t = setTimeout(() => load(search, page, projectFilter, unitFilter), 300)
    return () => clearTimeout(t)
  }, [search, projectFilter, unitFilter, page, load])

  function openCreate() { setEditingId(null); setForm(emptyForm); setFormMarketingName(me?.full_name ?? '—'); setUnitFormQuery(''); setModalOpen(true) }
  function openEdit(c: Client) {
    setEditingId(c.id)
    setForm({
      full_name: c.full_name, phone: c.phone ?? '', nik: c.nik ?? '', address: c.address ?? '',
      project_id: c.project_id ?? '', unit_id: c.unit_id ?? '',
      contract_value: c.contract_value, contract_date: c.contract_date ?? '',
      payment_type: c.payment_type,
      promo: c.promo ?? '', signature: c.signature ?? '', status: c.status,
    })
    // tampilkan marketing ASLI yang mengentry data ini, bukan user yang sedang login/mengedit
    setFormMarketingName(c.marketing_name ?? '—')
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setEditingId(null); setForm(emptyForm); setUnitFormQuery('') }

  // pilih unit → harga otomatis dari data unit
  function onSelectUnit(unitId: string) {
    const u = unitsFor(form.project_id).find((x) => x.id === unitId)
    setForm((f) => ({ ...f, unit_id: unitId, contract_value: u?.price != null ? Number(u.price) : f.contract_value }))
  }
  // Harga Jual dikunci begitu pembeli ditambahkan (tak ikut berubah otomatis kalau harga unit
  // di modul Proyek diedit belakangan) — tombol ini untuk staf yang memang mau menarik ulang secara manual.
  const selectedFormUnit = unitsFor(form.project_id).find((x) => x.id === form.unit_id)
  function ambilHargaUnit() {
    if (selectedFormUnit?.price != null) setForm((f) => ({ ...f, contract_value: Number(selectedFormUnit.price) }))
  }
  const unitOptionLabel = (u: Unit) => `${unitLabel(u) ?? ''}${u.unit_type ? ` (${u.unit_type})` : ''}`
  function handleUnitFilterQueryChange(text: string) {
    setUnitFilterQuery(text)
    const match = filterUnits.find((u) => (unitLabel(u) ?? '').toLowerCase() === text.trim().toLowerCase())
    setUnitFilter(match ? match.id : ''); setPage(1)
  }
  function handleUnitFormQueryChange(text: string) {
    setUnitFormQuery(text)
    // HANYA cocokkan kalau teksnya PERSIS label lengkap dropdown (mis. user klik saran datalist) —
    // aman dipasang di tiap ketikan krn tak mungkin kena oleh potongan teks yg baru separuh diketik.
    // Pencocokan yg lebih longgar (nomor polos, tanpa nol depan, dst) baru dicoba saat blur di bawah,
    // supaya ketikan yg sedang berjalan (mis. mau ketik "064") tak "dibajak" begitu baru sampai "06".
    const match = formUnits.find((u) => unitOptionLabel(u).toLowerCase() === text.trim().toLowerCase())
    if (match) onSelectUnit(match.id)
  }
  function resolveUnitFormQuery() {
    const q = unitFormQuery.trim().toLowerCase()
    if (!q) { onSelectUnit(''); return }
    // cocokkan: label lengkap dropdown, lalu "blok-nomor" saja, lalu nomor unit polos
    // (kalau nomornya unik di proyek ini — user sering cukup ketik nomornya tanpa blok/tipe).
    let match = formUnits.find((u) => unitOptionLabel(u).toLowerCase() === q)
    if (!match) match = formUnits.find((u) => (unitLabel(u) ?? '').toLowerCase() === q)
    if (!match) {
      const byNumber = formUnits.filter((u) => (u.unit_number ?? '').toLowerCase() === q)
      if (byNumber.length === 1) match = byNumber[0]
    }
    // nomor kavling sering di-nol-padding (mis. "036") — user biasanya cukup ketik "36" tanpa nol di depan
    if (!match && /^\d+$/.test(q)) {
      const byNumeric = formUnits.filter((u) => /^\d+$/.test(u.unit_number ?? '') && String(Number(u.unit_number)) === String(Number(q)))
      if (byNumeric.length === 1) match = byNumeric[0]
    }
    // tak ketemu → kosongkan (bukan simpan unit lama) supaya kelihatan jelas & tak kesimpan salah kavling
    onSelectUnit(match ? match.id : '')
  }
  // sinkron teks tampilan form HANYA saat unit_id sudah match (mis. buka Edit sebelum unit proyeknya
  // selesai lazy-load) — jangan pernah kosongkan di sini, supaya tak menimpa ketikan yang sedang berjalan.
  useEffect(() => {
    const u = formUnits.find((x) => x.id === form.unit_id)
    if (u) setUnitFormQuery(unitOptionLabel(u))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.unit_id, formUnits])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const payload: ClientCreate = { ...form }
      if (!payload.contract_value) delete payload.contract_value
      const rec = payload as unknown as Record<string, unknown>
      ;['phone', 'nik', 'address', 'project_id', 'unit_id', 'contract_date', 'payment_type', 'promo', 'signature'].forEach((k) => {
        if (rec[k] === '') delete rec[k]
      })
      if (editingId) await marketingService.updateClient(editingId, payload)
      else await marketingService.createClient(payload)
      closeModal(); await load(search, page, projectFilter, unitFilter)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Gagal menyimpan pembeli.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus pembeli ini?')) return
    try { await marketingService.deleteClient(id); setClients((prev) => prev.filter((c) => c.id !== id)) }
    catch { setError('Gagal menghapus pembeli.') }
  }

  const visibleColumns = ALL_COLUMNS.filter((c) => !c.toggleable || visibleCols[c.key as ToggleColKey])

  function renderCell(c: Client, key: ColDef['key']) {
    switch (key) {
      case 'tanggal':
        return <span className="text-slate-500 text-xs whitespace-nowrap">{c.contract_date ? new Date(c.contract_date).toLocaleDateString('id-ID') : '—'}</span>
      case 'nama':
        return <span className="font-medium text-slate-900">{c.full_name}</span>
      case 'phone':
        return <span className="text-slate-600">{c.phone ?? '—'}</span>
      case 'proyek':
        return <span className="text-slate-500">{projectName(c.project_id) ?? '—'}</span>
      case 'unit':
        // unit_label dari backend (selalu ada) — jangan andalkan unitsByProject yg dimuat lazy
        return <span className="text-slate-500">{c.unit_label ?? unitNumberById(c.unit_id) ?? c.unit_number ?? '—'}</span>
      case 'harga':
        return <span className="text-slate-600 whitespace-nowrap">{fmt(c.contract_value)}</span>
      case 'terbayar':
        return <span className="text-emerald-700 whitespace-nowrap">{c.contract_value == null ? '—' : fmt((c.contract_value) - (c.remaining ?? 0))}</span>
      case 'piutang':
        return <span className="text-slate-600 whitespace-nowrap">{c.contract_value == null ? '—' : fmt(c.remaining)}</span>
      case 'cara_beli': {
        const pt = c.payment_type ? paymentTypeConfig[c.payment_type] : null
        return pt ? <Badge label={pt.label} variant={pt.variant} /> : <span className="text-slate-400">—</span>
      }
      case 'kpr_stage':
        if (c.kpr_rejected) return <Badge label="Ditolak" variant="red" />
        return c.kpr_stage ? <Badge label={kprStageLabel[c.kpr_stage]} variant="blue" /> : <span className="text-slate-400">—</span>
      case 'status': {
        // Status pembayaran: Lunas bila sisa piutang habis; Batal bila pembeli nonaktif
        if (c.status === 'inactive') return <Badge label="Batal" variant="gray" />
        if (c.contract_value == null) return <span className="text-slate-400">—</span>
        return (c.remaining ?? 0) <= 0
          ? <Badge label="Lunas" variant="green" />
          : <Badge label="Belum Lunas" variant="yellow" />
      }
      case 'aksi':
        return (
          <div className="relative flex justify-end" data-action-menu-root>
            <button
              onClick={() => setActionMenuId((id) => (id === c.id ? null : c.id))}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md p-1.5 transition-colors"
              title="Aksi"
            >
              <MoreVertical size={16} />
            </button>
            {actionMenuId === c.id && (
              <div className="absolute right-0 top-full mt-1 w-56 card py-1 z-20 text-left">
                <Link to={`/marketing/clients/${c.id}/payments`} onClick={() => setActionMenuId(null)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <Wallet size={15} className="text-slate-400" /> Pembayaran & Cicilan
                </Link>
                <Link to={`/marketing/clients/${c.id}/tax`} onClick={() => setActionMenuId(null)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <Scale size={15} className="text-slate-400" /> Pajak & Notaris
                </Link>
                {c.payment_type === 'kpr' && (
                  <Link to={`/marketing/clients/${c.id}/kpr`} onClick={() => setActionMenuId(null)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <Landmark size={15} className="text-slate-400" /> KPR
                  </Link>
                )}
                <button onClick={() => { setActionMenuId(null); openEdit(c) }} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 w-full text-left">
                  <Pencil size={15} className="text-slate-400" /> Edit
                </button>
                <button onClick={() => { setActionMenuId(null); handleDelete(c.id) }} className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left">
                  <Trash2 size={15} /> Hapus
                </button>
              </div>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 w-56" placeholder="Cari nama atau unit..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="input w-40" value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setUnitFilter(''); setUnitFilterQuery(''); setPage(1) }}>
            <option value="">Semua Proyek</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            className="input w-40" list="client-filter-unit-suggest" placeholder="Semua Unit"
            value={unitFilterQuery} onChange={(e) => handleUnitFilterQueryChange(e.target.value)}
          />
          <datalist id="client-filter-unit-suggest">
            {filterUnits.map((u) => <option key={u.id} value={unitLabel(u) ?? ''} />)}
          </datalist>
          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setColMenuOpen((v) => !v)} className="btn-secondary flex items-center gap-2 text-sm">
              <Columns3 size={14} /> Kolom
            </button>
            {colMenuOpen && (
              <div className="absolute left-0 mt-2 w-56 card p-2 z-20">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Tampilkan Kolom</p>
                {ALL_COLUMNS.filter((c) => c.toggleable).map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCols[c.key as ToggleColKey]}
                      onChange={() => toggleCol(c.key as ToggleColKey)}
                      className="rounded border-slate-300"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm" onClick={openCreate}>
          <Plus size={14} /> Tambah Pembeli
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {visibleColumns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-slate-400 text-sm">
                Belum ada pembeli sesuai kriteria.
              </td></tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-4 py-3">{renderCell(c, col.key)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} pages={pages} total={total} onPage={setPage} />
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Pembeli' : 'Tambah Pembeli'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Nama Lengkap *</label>
            <input className="input" required minLength={2} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">No. HP</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">NIK (KTP)</label>
              <input className="input" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Alamat</label>
            <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Marketing</label>
            <input className="input bg-slate-50" value={formMarketingName} readOnly
              title={editingId ? 'User yang pertama kali mengentry data ini — tidak berubah walau diedit user lain' : 'Otomatis dari user yang login'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Proyek</label>
              <select className="input" value={form.project_id} onChange={(e) => { setForm({ ...form, project_id: e.target.value, unit_id: '' }); setUnitFormQuery('') }}>
                <option value="">Pilih proyek...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">No. Unit / Kavling</label>
              <input
                className="input" list="client-form-unit-suggest"
                placeholder={form.project_id ? 'Cari no. unit / blok...' : 'Pilih proyek dulu'}
                value={unitFormQuery} onChange={(e) => handleUnitFormQueryChange(e.target.value)} onBlur={resolveUnitFormQuery} disabled={!form.project_id}
              />
              <datalist id="client-form-unit-suggest">
                {formUnits.map((u) => <option key={u.id} value={unitOptionLabel(u)} />)}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Harga Jual (Rp)</label>
              <MoneyInput value={form.contract_value} onChange={(v) => setForm({ ...form, contract_value: v })} />
              {selectedFormUnit?.price != null && (
                <button type="button" onClick={ambilHargaUnit} className="mt-1 text-xs text-brand-600 hover:underline" title={`Harga unit terkini: ${fmt(Number(selectedFormUnit.price))}`}>
                  Ambil harga terbaru dari unit
                </button>
              )}
            </div>
            <div>
              <label className="label">Tanggal *</label>
              <DateInput className="input" max={today()} required value={form.contract_date} onChange={(v) => setForm({ ...form, contract_date: v })} />
            </div>
            <div>
              <label className="label">Cara Beli</label>
              <select className="input" value={form.payment_type ?? ''} onChange={(e) => setForm({ ...form, payment_type: (e.target.value || undefined) as ClientPaymentType | undefined })}>
                <option value="">Pilih...</option>
                <option value="cash">Cash</option>
                <option value="kpr">KPR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Promo</label>
              <input className="input" placeholder="mis. Free biaya KPR" value={form.promo} onChange={(e) => setForm({ ...form, promo: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}>
                {(Object.keys(statusConfig) as ClientStatus[]).map((k) => <option key={k} value={k}>{statusConfig[k].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Tanda Tangan Digital</label>
            <SignaturePad value={form.signature} onChange={(d) => setForm({ ...form, signature: d })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={closeModal}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingId ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
