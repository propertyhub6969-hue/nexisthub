import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, Loader2, Wallet, X, PackageCheck, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { procurementService } from '../../services/procurement'
import { propertyService } from '../../services/property'
import type {
  Vendor, VendorCreate, PurchaseOrder, POCreate, POItemIn, VendorPayment,
  POStatus, Project, Unit, StockBalance, StockMovement, StockInCreate, StockOutCreate,
} from '../../types'

const fmt = (n?: number) => n == null ? 'Rp 0' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const poStatusCfg: Record<POStatus, { label: string; variant: 'gray' | 'blue' | 'green' | 'red' }> = {
  draft: { label: 'Draft', variant: 'gray' }, ordered: { label: 'Dipesan', variant: 'blue' },
  received: { label: 'Diterima', variant: 'green' }, cancelled: { label: 'Batal', variant: 'red' },
}
const emptyPO = (): POCreate => ({ vendor_id: '', project_id: '', unit_id: '', po_number: '', order_date: '', status: 'draft', items: [] })
const emptyVendor: VendorCreate = { name: '', category: 'Material', contact_name: '', phone: '', npwp: '', bank_name: '', bank_account: '' }

const emptyStockIn = (pid: string): StockInCreate => ({ project_id: pid, material_name: '', unit: '', quantity: 0, unit_price: 0, movement_date: '' })
const emptyStockOut = (pid: string): StockOutCreate => ({ project_id: pid, material_name: '', unit: '', quantity: 0, unit_id: '', movement_date: '' })

export default function Procurement() {
  const [tab, setTab] = useState<'po' | 'stock' | 'vendor'>('po')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // PO modal
  const [poModal, setPoModal] = useState(false)
  const [poForm, setPoForm] = useState<POCreate>(emptyPO())
  const [poEditId, setPoEditId] = useState<string | null>(null)
  // Payment modal
  const [payModal, setPayModal] = useState(false)
  const [payPo, setPayPo] = useState<PurchaseOrder | null>(null)
  const [payments, setPayments] = useState<VendorPayment[]>([])
  const [payAmount, setPayAmount] = useState<number | undefined>(undefined)
  const [payDate, setPayDate] = useState('')
  // Vendor modal
  const [vModal, setVModal] = useState(false)
  const [vForm, setVForm] = useState<VendorCreate>(emptyVendor)
  const [vEditId, setVEditId] = useState<string | null>(null)
  // Stok
  const [stockProject, setStockProject] = useState('')
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [inModal, setInModal] = useState(false)
  const [inForm, setInForm] = useState<StockInCreate>(emptyStockIn(''))
  const [outModal, setOutModal] = useState(false)
  const [outForm, setOutForm] = useState<StockOutCreate>(emptyStockOut(''))

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [v, p, u, po] = await Promise.all([
        procurementService.listVendors(), propertyService.listProjects({ size: 500 }),
        propertyService.listUnits({ size: 500 }), procurementService.listPOs(),
      ])
      setVendors(v); setProjects(p.items); setUnits(u.items); setPos(po)
    } catch { setError('Gagal memuat data procurement.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const reloadPO = async () => setPos(await procurementService.listPOs())
  const reloadVendor = async () => setVendors(await procurementService.listVendors())

  // default proyek stok saat data siap
  useEffect(() => { if (!stockProject && projects.length) setStockProject(projects[0].id) }, [projects, stockProject])

  const loadStock = useCallback(async (pid: string) => {
    if (!pid) { setBalances([]); setMovements([]); return }
    const [b, m] = await Promise.all([procurementService.stockBalance(pid), procurementService.stockMovements(pid)])
    setBalances(b); setMovements(m)
  }, [])
  useEffect(() => { if (tab === 'stock' && stockProject) loadStock(stockProject) }, [tab, stockProject, loadStock])

  function openStockIn() { setInForm(emptyStockIn(stockProject)); setInModal(true) }
  function openStockOut() { setOutForm(emptyStockOut(stockProject)); setOutModal(true) }
  async function submitIn(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...inForm }; if (p.movement_date === '') delete p.movement_date
      await procurementService.stockIn(p); setInModal(false); await loadStock(stockProject); await reloadPO()
    } catch { setError('Gagal mencatat barang masuk.') } finally { setSaving(false) }
  }
  async function submitOut(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const p = { ...outForm }; const rec = p as unknown as Record<string, unknown>
      ;['unit_id', 'movement_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      await procurementService.stockOut(p); setOutModal(false); await loadStock(stockProject)
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(d || 'Gagal distribusi material.')
    } finally { setSaving(false) }
  }
  async function receivePO(po: PurchaseOrder) {
    if (!po.project_id) { setError('PO belum punya proyek untuk lokasi stok.'); return }
    if (!confirm(`Terima semua item PO ${po.po_number || ''} ke stok proyek?`)) return
    try { await procurementService.receivePO(po.id); await reloadPO(); if (stockProject === po.project_id) await loadStock(stockProject) }
    catch { setError('Gagal menerima PO ke stok.') }
  }
  async function delMovement(id: string) {
    if (!confirm('Hapus mutasi ini?')) return
    try { await procurementService.deleteMovement(id); await loadStock(stockProject) } catch { /* noop */ }
  }
  const stockUnits = units.filter((u) => u.project_id === stockProject)

  // ── PO ──
  function openPoCreate() { setPoEditId(null); setPoForm(emptyPO()); setPoModal(true) }
  function openPoEdit(po: PurchaseOrder) {
    setPoEditId(po.id)
    setPoForm({
      vendor_id: po.vendor_id ?? '', project_id: po.project_id ?? '', unit_id: po.unit_id ?? '',
      po_number: po.po_number ?? '', order_date: po.order_date ?? '', status: po.status,
      items: po.items.map((i) => ({ item_name: i.item_name, unit: i.unit ?? '', quantity: Number(i.quantity), unit_price: Number(i.unit_price), notes: i.notes })),
    })
    setPoModal(true)
  }
  const poTotal = poForm.items.reduce((a, i) => a + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)
  function addItem() { setPoForm((f) => ({ ...f, items: [...f.items, { item_name: '', unit: '', quantity: 1, unit_price: 0 }] })) }
  function setItem(idx: number, patch: Partial<POItemIn>) {
    setPoForm((f) => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }))
  }
  function removeItem(idx: number) { setPoForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) })) }

  async function submitPO(e: React.FormEvent) {
    e.preventDefault()
    if (poForm.items.length === 0) { setError('Tambahkan minimal 1 item.'); return }
    setSaving(true)
    try {
      const p = { ...poForm }
      const rec = p as unknown as Record<string, unknown>
      ;['vendor_id', 'project_id', 'unit_id', 'po_number', 'order_date'].forEach((k) => { if (rec[k] === '') delete rec[k] })
      if (poEditId) await procurementService.updatePO(poEditId, p); else await procurementService.createPO(p)
      setPoModal(false); await reloadPO()
    } catch { setError('Gagal menyimpan PO.') } finally { setSaving(false) }
  }
  async function delPO(id: string) {
    if (!confirm('Hapus (arsipkan) PO ini?')) return
    try { await procurementService.deletePO(id); await reloadPO() } catch { setError('Gagal menghapus PO.') }
  }

  // ── Payment ──
  async function openPay(po: PurchaseOrder) {
    setPayPo(po); setPayAmount(po.remaining || undefined); setPayDate(''); setPayModal(true)
    setPayments(await procurementService.listPayments(po.id))
  }
  async function addPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!payPo || !payAmount) return
    setSaving(true)
    try {
      await procurementService.createPayment({ purchase_order_id: payPo.id, amount: payAmount, payment_date: payDate || undefined })
      setPayments(await procurementService.listPayments(payPo.id)); await reloadPO()
      setPayAmount(undefined); setPayDate('')
    } catch { setError('Gagal mencatat pembayaran.') } finally { setSaving(false) }
  }
  async function delPayment(id: string) {
    if (!payPo) return
    try { await procurementService.deletePayment(id); setPayments(await procurementService.listPayments(payPo.id)); await reloadPO() } catch { /* noop */ }
  }

  // ── Vendor ──
  function openVCreate() { setVEditId(null); setVForm(emptyVendor); setVModal(true) }
  function openVEdit(v: Vendor) {
    setVEditId(v.id)
    setVForm({ name: v.name, category: v.category ?? '', contact_name: v.contact_name ?? '', phone: v.phone ?? '', npwp: v.npwp ?? '', bank_name: v.bank_name ?? '', bank_account: v.bank_account ?? '' })
    setVModal(true)
  }
  async function submitV(e: React.FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      if (vEditId) await procurementService.updateVendor(vEditId, vForm); else await procurementService.createVendor(vForm)
      setVModal(false); await reloadVendor()
    } catch { setError('Gagal menyimpan vendor.') } finally { setSaving(false) }
  }
  async function delV(id: string) {
    if (!confirm('Hapus vendor ini?')) return
    try { await procurementService.deleteVendor(id); await reloadVendor() } catch { setError('Gagal menghapus vendor.') }
  }

  const projName = (id?: string) => projects.find((p) => p.id === id)?.name
  const unitLabel = (id?: string) => { const u = units.find((x) => x.id === id); return u ? [u.block, u.unit_number].filter(Boolean).join('-') : undefined }
  const formUnits = units.filter((u) => u.project_id === poForm.project_id)

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200">
        {(['po', 'stock', 'vendor'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'po' ? 'Purchase Order' : t === 'stock' ? 'Stok Material' : 'Vendor'}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {tab === 'po' ? (
        <>
          <div className="flex justify-end">
            <button className="btn-primary flex items-center gap-2 text-sm" onClick={openPoCreate}><Plus size={14} /> Buat PO</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>{['No. PO', 'Vendor', 'Proyek', 'Total', 'Terbayar', 'Status', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pos.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada PO. Klik "Buat PO".</td></tr>
                ) : pos.map((po) => {
                  const st = poStatusCfg[po.status]
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{po.po_number || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{po.vendor_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{projName(po.project_id) ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{fmt(po.total_amount)}</td>
                      <td className="px-4 py-3"><span className="text-emerald-600">{fmt(po.paid_amount)}</span> {Number(po.remaining) > 0 && <span className="text-xs text-amber-600">(sisa {fmt(po.remaining)})</span>}</td>
                      <td className="px-4 py-3">{st && <Badge label={st.label} variant={st.variant} />}</td>
                      <td className="px-4 py-3"><div className="flex items-center justify-end gap-3">
                        {po.status !== 'received' && <button onClick={() => receivePO(po)} className="text-slate-400 hover:text-emerald-600" title="Terima ke stok"><PackageCheck size={15} /></button>}
                        <button onClick={() => openPay(po)} className="text-slate-400 hover:text-brand-600" title="Pembayaran"><Wallet size={15} /></button>
                        <button onClick={() => openPoEdit(po)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => delPO(po.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={15} /></button>
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'stock' ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <select className="input max-w-xs" value={stockProject} onChange={(e) => setStockProject(e.target.value)}>
              <option value="">Pilih proyek...</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button className="btn-secondary text-sm flex items-center gap-1" onClick={openStockIn} disabled={!stockProject}><ArrowDownToLine size={14} /> Barang Masuk</button>
              <button className="btn-primary text-sm flex items-center gap-1" onClick={openStockOut} disabled={!stockProject}><ArrowUpFromLine size={14} /> Distribusi</button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900">Saldo Stok Material</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Material', 'Satuan', 'Masuk', 'Keluar', 'Sisa', 'HPP rata2', 'Nilai Sisa'].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {balances.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada stok. Catat "Barang Masuk" atau "Terima ke stok" dari PO.</td></tr>
                ) : balances.map((b, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{b.material_name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{b.unit ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{Number(b.qty_in)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{Number(b.qty_out)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{Number(b.balance)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fmt(b.avg_price)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmt(b.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-900">Riwayat Mutasi</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Tanggal', 'Material', 'Tipe', 'Qty', 'Harga', 'Ke Unit', ''].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada mutasi.</td></tr>
                ) : movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{m.movement_date ? new Date(m.movement_date).toLocaleDateString('id-ID') : '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{m.material_name}</td>
                    <td className="px-4 py-2.5">{m.movement_type === 'in' ? <Badge label="Masuk" variant="green" /> : <Badge label="Keluar" variant="orange" />}</td>
                    <td className="px-4 py-2.5 text-slate-600">{Number(m.quantity)} {m.unit ?? ''}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fmt(m.unit_price)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.movement_type === 'out' ? (unitLabel(m.unit_id) ?? 'Umum') : '—'}</td>
                    <td className="px-4 py-2.5"><button onClick={() => delMovement(m.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <button className="btn-primary flex items-center gap-2 text-sm" onClick={openVCreate}><Plus size={14} /> Tambah Vendor</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>{['Nama', 'Kategori', 'Kontak', 'No. HP', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada vendor.</td></tr>
                ) : vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{v.name}</td>
                    <td className="px-4 py-3 text-slate-500">{v.category ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{v.contact_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{v.phone ?? '—'}</td>
                    <td className="px-4 py-3"><div className="flex items-center justify-end gap-3">
                      <button onClick={() => openVEdit(v)} className="text-slate-400 hover:text-brand-600" title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => delV(v.id)} className="text-slate-400 hover:text-red-600" title="Hapus"><Trash2 size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal PO */}
      <Modal open={poModal} onClose={() => setPoModal(false)} title={poEditId ? 'Edit PO' : 'Buat Purchase Order'}>
        <form onSubmit={submitPO} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Vendor</label>
              <select className="input" value={poForm.vendor_id} onChange={(e) => setPoForm({ ...poForm, vendor_id: e.target.value })}>
                <option value="">Pilih vendor...</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            <div><label className="label">No. PO</label><input className="input" value={poForm.po_number} onChange={(e) => setPoForm({ ...poForm, po_number: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Proyek</label>
              <select className="input" value={poForm.project_id} onChange={(e) => setPoForm({ ...poForm, project_id: e.target.value, unit_id: '' })}>
                <option value="">Umum / pilih...</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div><label className="label">Unit (opsional)</label>
              <select className="input" value={poForm.unit_id} onChange={(e) => setPoForm({ ...poForm, unit_id: e.target.value })} disabled={!poForm.project_id}>
                <option value="">Umum proyek</option>{formUnits.map((u) => <option key={u.id} value={u.id}>{[u.block, u.unit_number].filter(Boolean).join('-')}</option>)}
              </select></div>
            <div><label className="label">Status</label>
              <select className="input" value={poForm.status} onChange={(e) => setPoForm({ ...poForm, status: e.target.value as POStatus })}>
                {(Object.keys(poStatusCfg) as POStatus[]).map((k) => <option key={k} value={k}>{poStatusCfg[k].label}</option>)}
              </select></div>
          </div>
          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Item Material</label>
              <button type="button" onClick={addItem} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12} /> Tambah item</button>
            </div>
            <div className="space-y-2">
              {poForm.items.length === 0 && <p className="text-xs text-slate-400">Belum ada item.</p>}
              {poForm.items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input className="input flex-[3]" placeholder="Nama material" required value={it.item_name} onChange={(e) => setItem(idx, { item_name: e.target.value })} />
                  <input className="input flex-1" placeholder="sat." value={it.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                  <input className="input flex-1" type="number" min={0} placeholder="qty" value={it.quantity || ''} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                  <input className="input flex-[2]" type="number" min={0} placeholder="harga" value={it.unit_price || ''} onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })} />
                  <span className="text-xs text-slate-500 flex-[2] text-right">{fmt(Number(it.quantity || 0) * Number(it.unit_price || 0))}</span>
                  <button type="button" onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-600"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="text-right mt-2 text-sm font-semibold text-slate-900">Total: {fmt(poTotal)}</div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setPoModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Pembayaran PO */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title={`Pembayaran — ${payPo?.po_number || 'PO'}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="card p-2"><p className="text-xs text-slate-500">Total</p><p className="font-semibold">{fmt(payPo?.total_amount)}</p></div>
            <div className="card p-2"><p className="text-xs text-slate-500">Terbayar</p><p className="font-semibold text-emerald-600">{fmt(payPo?.paid_amount)}</p></div>
            <div className="card p-2"><p className="text-xs text-slate-500">Sisa</p><p className="font-semibold text-amber-600">{fmt(payPo?.remaining)}</p></div>
          </div>
          <div className="space-y-1">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b border-slate-100 py-1.5">
                <span className="text-emerald-600 font-medium">{fmt(p.amount)}</span>
                <span className="text-xs text-slate-400">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('id-ID') : '—'}</span>
                <button onClick={() => delPayment(p.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
              </div>
            ))}
            {payments.length === 0 && <p className="text-xs text-slate-400">Belum ada pembayaran.</p>}
          </div>
          <form onSubmit={addPayment} className="flex items-end gap-2 border-t border-slate-100 pt-3">
            <div className="flex-1"><label className="label">Nominal (Rp)</label><input className="input" type="number" min={0} required value={payAmount ?? ''} onChange={(e) => setPayAmount(e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div className="flex-1"><label className="label">Tanggal</label><input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            <button type="submit" className="btn-primary text-sm h-[38px]" disabled={saving}>Bayar</button>
          </form>
        </div>
      </Modal>

      {/* Modal Barang Masuk */}
      <Modal open={inModal} onClose={() => setInModal(false)} title="Barang Masuk (Stok)">
        <form onSubmit={submitIn} className="space-y-3">
          <div><label className="label">Nama Material *</label><input className="input" required value={inForm.material_name} onChange={(e) => setInForm({ ...inForm, material_name: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Satuan</label><input className="input" placeholder="sak" value={inForm.unit} onChange={(e) => setInForm({ ...inForm, unit: e.target.value })} /></div>
            <div><label className="label">Qty *</label><input className="input" type="number" min={0} step="0.01" required value={inForm.quantity || ''} onChange={(e) => setInForm({ ...inForm, quantity: Number(e.target.value) })} /></div>
            <div><label className="label">Harga/sat</label><input className="input" type="number" min={0} value={inForm.unit_price || ''} onChange={(e) => setInForm({ ...inForm, unit_price: Number(e.target.value) })} /></div>
          </div>
          <div><label className="label">Tanggal</label><input className="input" type="date" value={inForm.movement_date} onChange={(e) => setInForm({ ...inForm, movement_date: e.target.value })} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setInModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Distribusi */}
      <Modal open={outModal} onClose={() => setOutModal(false)} title="Distribusi Material ke Unit">
        <form onSubmit={submitOut} className="space-y-3">
          <div><label className="label">Material *</label>
            <select className="input" required value={`${outForm.material_name}|${outForm.unit ?? ''}`} onChange={(e) => { const [n, u] = e.target.value.split('|'); setOutForm({ ...outForm, material_name: n, unit: u }) }}>
              <option value="|">Pilih material...</option>
              {balances.filter((b) => Number(b.balance) > 0).map((b, i) => <option key={i} value={`${b.material_name}|${b.unit ?? ''}`}>{b.material_name} ({b.unit ?? '-'}) — sisa {Number(b.balance)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Qty *</label><input className="input" type="number" min={0} step="0.01" required value={outForm.quantity || ''} onChange={(e) => setOutForm({ ...outForm, quantity: Number(e.target.value) })} /></div>
            <div><label className="label">Tanggal</label><input className="input" type="date" value={outForm.movement_date} onChange={(e) => setOutForm({ ...outForm, movement_date: e.target.value })} /></div>
          </div>
          <div><label className="label">Ke Unit</label>
            <select className="input" value={outForm.unit_id} onChange={(e) => setOutForm({ ...outForm, unit_id: e.target.value })}>
              <option value="">Umum proyek (tanpa unit)</option>
              {stockUnits.map((u) => <option key={u.id} value={u.id}>{[u.block, u.unit_number].filter(Boolean).join('-')}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setOutModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Distribusi</button>
          </div>
        </form>
      </Modal>

      {/* Modal Vendor */}
      <Modal open={vModal} onClose={() => setVModal(false)} title={vEditId ? 'Edit Vendor' : 'Tambah Vendor'}>
        <form onSubmit={submitV} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nama Vendor *</label><input className="input" required minLength={2} value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} /></div>
            <div><label className="label">Kategori</label><input className="input" placeholder="Material / Kontraktor" value={vForm.category} onChange={(e) => setVForm({ ...vForm, category: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nama Kontak</label><input className="input" value={vForm.contact_name} onChange={(e) => setVForm({ ...vForm, contact_name: e.target.value })} /></div>
            <div><label className="label">No. HP</label><input className="input" value={vForm.phone} onChange={(e) => setVForm({ ...vForm, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">NPWP</label><input className="input" value={vForm.npwp} onChange={(e) => setVForm({ ...vForm, npwp: e.target.value })} /></div>
            <div><label className="label">Bank</label><input className="input" value={vForm.bank_name} onChange={(e) => setVForm({ ...vForm, bank_name: e.target.value })} /></div>
            <div><label className="label">No. Rekening</label><input className="input" value={vForm.bank_account} onChange={(e) => setVForm({ ...vForm, bank_account: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setVModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
