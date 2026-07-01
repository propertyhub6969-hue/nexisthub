import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Landmark, CheckCircle2, Banknote } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { marketingService } from '../../services/marketing'
import { kprService } from '../../services/kpr'
import type { Client, Bank, KprApplication, KprStage } from '../../types'

const fmt = (n?: number) => n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))

const STAGES: { key: KprStage; label: string }[] = [
  { key: 'collect_berkas', label: 'Collect Berkas' },
  { key: 'berkas_masuk_bank', label: 'Berkas Masuk Bank' },
  { key: 'sp3k', label: 'SP3K' },
  { key: 'akad_kredit', label: 'Akad Kredit' },
  { key: 'pencairan', label: 'Pencairan' },
]
const stageIndex = (s?: KprStage) => STAGES.findIndex((x) => x.key === s)

export default function ClientKpr() {
  const { clientId = '' } = useParams()
  const [client, setClient] = useState<Client | null>(null)
  const [banks, setBanks] = useState<Bank[]>([])
  const [kpr, setKpr] = useState<KprApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [disModal, setDisModal] = useState(false)
  const [disAmount, setDisAmount] = useState<number | undefined>(undefined)
  const [disDate, setDisDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cl, bk, apps] = await Promise.all([
        marketingService.getClient(clientId), kprService.listBanks(), kprService.listApplications(clientId),
      ])
      setClient(cl); setBanks(bk); setKpr(apps[0] ?? null)
    } catch { setError('Gagal memuat data KPR.') } finally { setLoading(false) }
  }, [clientId])
  useEffect(() => { load() }, [load])

  async function createApp() {
    setSaving(true)
    try { const k = await kprService.createApplication({ client_id: clientId, stage: 'collect_berkas' }); setKpr(k) }
    catch { setError('Gagal membuat pengajuan.') } finally { setSaving(false) }
  }

  function set<K extends keyof KprApplication>(field: K, value: KprApplication[K]) {
    setKpr((k) => k ? { ...k, [field]: value } : k)
  }

  async function save() {
    if (!kpr) return
    setSaving(true)
    try {
      const k = await kprService.updateApplication(kpr.id, {
        bank_id: kpr.bank_id || undefined, stage: kpr.stage,
        plafond: kpr.plafond, tenor_months: kpr.tenor_months, interest_rate: kpr.interest_rate,
        sp3k_number: kpr.sp3k_number || undefined, sikasep_number: kpr.sikasep_number || undefined,
        submitted_date: kpr.submitted_date || undefined, sp3k_date: kpr.sp3k_date || undefined, akad_date: kpr.akad_date || undefined,
        notes: kpr.notes || undefined,
      })
      setKpr(k)
    } catch { setError('Gagal menyimpan.') } finally { setSaving(false) }
  }

  async function submitDisburse(e: React.FormEvent) {
    e.preventDefault()
    if (!kpr || !disAmount) return
    setSaving(true)
    try {
      const k = await kprService.disburse(kpr.id, disAmount, disDate || undefined)
      setKpr(k); setDisModal(false)
    } catch { setError('Gagal mencatat pencairan.') } finally { setSaving(false) }
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  const curIdx = stageIndex(kpr?.stage)

  return (
    <div className="space-y-5">
      <div>
        <Link to="/marketing/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-1"><ArrowLeft size={14} /> Daftar Pembeli</Link>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Landmark size={18} /> KPR — {client?.full_name ?? 'Pembeli'}</h1>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {!kpr ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-500 mb-3">Belum ada pengajuan KPR untuk pembeli ini.</p>
          <button className="btn-primary text-sm inline-flex items-center gap-2" onClick={createApp} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Buat Pengajuan KPR
          </button>
        </div>
      ) : (
        <>
          {/* Stepper */}
          <div className="card p-5">
            <div className="flex items-center">
              {STAGES.map((s, i) => (
                <div key={s.key} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${i <= curIdx ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {i < curIdx ? <CheckCircle2 size={16} /> : i + 1}
                    </div>
                    <span className={`mt-1.5 text-[11px] text-center ${i <= curIdx ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>{s.label}</span>
                  </div>
                  {i < STAGES.length - 1 && <div className={`h-0.5 flex-1 -mt-4 ${i < curIdx ? 'bg-brand-500' : 'bg-slate-100'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="card p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bank</label>
                <select className="input" value={kpr.bank_id ?? ''} onChange={(e) => set('bank_id', e.target.value)}>
                  <option value="">Pilih bank...</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Tahap</label>
                <select className="input" value={kpr.stage} onChange={(e) => set('stage', e.target.value as KprStage)}>
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Plafon (Rp)</label><input className="input" type="number" min={0} value={kpr.plafond ?? ''} onChange={(e) => set('plafond', e.target.value ? Number(e.target.value) : undefined)} /></div>
              <div><label className="label">Tenor (bulan)</label><input className="input" type="number" min={0} value={kpr.tenor_months ?? ''} onChange={(e) => set('tenor_months', e.target.value ? Number(e.target.value) : undefined)} /></div>
              <div><label className="label">Bunga (%)</label><input className="input" type="number" step="0.01" min={0} value={kpr.interest_rate ?? ''} onChange={(e) => set('interest_rate', e.target.value ? Number(e.target.value) : undefined)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">No. SP3K</label><input className="input" value={kpr.sp3k_number ?? ''} onChange={(e) => set('sp3k_number', e.target.value)} /></div>
              <div><label className="label">No. SiKasep/SiKumbang</label><input className="input" placeholder="untuk subsidi" value={kpr.sikasep_number ?? ''} onChange={(e) => set('sikasep_number', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Tgl Pengajuan</label><input className="input" type="date" value={kpr.submitted_date ?? ''} onChange={(e) => set('submitted_date', e.target.value)} /></div>
              <div><label className="label">Tgl SP3K</label><input className="input" type="date" value={kpr.sp3k_date ?? ''} onChange={(e) => set('sp3k_date', e.target.value)} /></div>
              <div><label className="label">Tgl Akad</label><input className="input" type="date" value={kpr.akad_date ?? ''} onChange={(e) => set('akad_date', e.target.value)} /></div>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-sm flex items-center gap-2" onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
            </div>
          </div>

          {/* Pencairan */}
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Banknote size={16} /> Pencairan KPR</p>
              {kpr.pencairan_amount != null
                ? <p className="text-sm text-emerald-600 mt-1">Cair {fmt(kpr.pencairan_amount)} pada {kpr.pencairan_date ? new Date(kpr.pencairan_date).toLocaleDateString('id-ID') : '—'} — otomatis tercatat sebagai uang masuk (Bank)</p>
                : <p className="text-sm text-slate-500 mt-1">Belum cair. Catat pencairan → otomatis jadi uang masuk di menu Pembayaran.</p>}
            </div>
            <button className="btn-primary text-sm" onClick={() => { setDisAmount(kpr.pencairan_amount ?? kpr.plafond); setDisDate(kpr.pencairan_date ?? ''); setDisModal(true) }}>
              {kpr.pencairan_amount != null ? 'Ubah Pencairan' : 'Catat Pencairan'}
            </button>
          </div>
        </>
      )}

      <Modal open={disModal} onClose={() => setDisModal(false)} title="Catat Pencairan KPR">
        <form onSubmit={submitDisburse} className="space-y-3">
          <div><label className="label">Jumlah Pencairan (Rp) *</label><input className="input" type="number" min={0} required value={disAmount ?? ''} onChange={(e) => setDisAmount(e.target.value ? Number(e.target.value) : undefined)} /></div>
          <div><label className="label">Tanggal Pencairan</label><input className="input" type="date" value={disDate} onChange={(e) => setDisDate(e.target.value)} /></div>
          <p className="text-xs text-slate-400">Ini akan menandai tahap Pencairan & membuat catatan uang masuk (sumber Bank) di menu Pembayaran pembeli.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setDisModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
