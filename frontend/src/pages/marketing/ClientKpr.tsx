import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Landmark, CheckCircle2, Banknote, Check, Plus, Trash2, XCircle, BellRing, Scale, HardHat, FileCheck } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import MoneyInput from '../../components/ui/MoneyInput'
import { marketingService } from '../../services/marketing'
import { kprService } from '../../services/kpr'
import type { Client, Bank, KprApplication, KprStage, Disbursement } from '../../types'

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
  const [apps, setApps] = useState<KprApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedTick, setSavedTick] = useState(0) // berubah tiap simpan sukses → memicu indikator "Tersimpan"
  const [disModal, setDisModal] = useState(false)
  const [disAmount, setDisAmount] = useState<number | undefined>(undefined)
  const [disDate, setDisDate] = useState('')
  const [disNotes, setDisNotes] = useState('')
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [rejModal, setRejModal] = useState(false)
  const [rejReason, setRejReason] = useState('')
  const [rejDate, setRejDate] = useState('')
  const [rejCascade, setRejCascade] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cl, bk, list] = await Promise.all([
        marketingService.getClient(clientId), kprService.listBanks(), kprService.listApplications(clientId),
      ])
      setClient(cl); setBanks(bk); setApps(list)
      const app = list[0] ?? null
      setKpr(app)
      setDisbursements(app ? await kprService.listDisbursements(app.id) : [])
    } catch { setError('Gagal memuat data KPR.') } finally { setLoading(false) }
  }, [clientId])
  useEffect(() => { load() }, [load])

  const reloadDisbursements = async (kprId: string) => setDisbursements(await kprService.listDisbursements(kprId))

  async function createApp() {
    setSaving(true)
    try {
      const k = await kprService.createApplication({ client_id: clientId, stage: 'collect_berkas' })
      setKpr(k); setApps((prev) => [k, ...prev]); setDisbursements([])
    }
    catch { setError('Gagal membuat pengajuan.') } finally { setSaving(false) }
  }

  // ── Tolak pengajuan ──
  function openReject() { setRejReason(''); setRejDate(new Date().toISOString().slice(0, 10)); setRejCascade(true); setRejModal(true) }
  async function submitReject(e: React.FormEvent) {
    e.preventDefault()
    if (!kpr) return
    setSaving(true); setError('')
    try {
      const k = await kprService.reject(kpr.id, { reason: rejReason || undefined, rejected_date: rejDate || undefined, cascade_release_unit: rejCascade })
      setKpr(k)
      setApps((prev) => prev.map((a) => (a.id === k.id ? k : a)))
      setRejModal(false)
      if (rejCascade) { const cl = await marketingService.getClient(clientId); setClient(cl) }
    } catch { setError('Gagal menolak pengajuan.') } finally { setSaving(false) }
  }

  function set<K extends keyof KprApplication>(field: K, value: KprApplication[K]) {
    setKpr((k) => k ? { ...k, [field]: value } : k)
  }

  async function save() {
    if (!kpr) return
    setSaving(true)
    setError('')
    try {
      const k = await kprService.updateApplication(kpr.id, {
        bank_id: kpr.bank_id || undefined, stage: kpr.stage,
        plafond: kpr.plafond, tenor_months: kpr.tenor_months, interest_rate: kpr.interest_rate,
        sp3k_number: kpr.sp3k_number || undefined, sikasep_number: kpr.sikasep_number || undefined,
        submitted_date: kpr.submitted_date || undefined, bank_submission_date: kpr.bank_submission_date || undefined,
        sp3k_date: kpr.sp3k_date || undefined, akad_date: kpr.akad_date || undefined,
        notes: kpr.notes || undefined,
      })
      setKpr(k)
      setSavedTick((t) => t + 1)
    } catch { setError('Gagal menyimpan. Periksa isian Anda.') } finally { setSaving(false) }
  }

  // Sembunyikan indikator "Tersimpan" otomatis setelah 2.5 detik
  useEffect(() => {
    if (savedTick === 0) return
    const t = setTimeout(() => setSavedTick(0), 2500)
    return () => clearTimeout(t)
  }, [savedTick])

  function openDisburse() { setDisAmount(undefined); setDisDate(''); setDisNotes(''); setDisModal(true) }
  async function submitDisburse(e: React.FormEvent) {
    e.preventDefault()
    if (!kpr || !disAmount) return
    setSaving(true)
    try {
      const k = await kprService.disburse(kpr.id, disAmount, disDate || undefined, disNotes || undefined)
      setKpr(k); setDisModal(false)
      await reloadDisbursements(kpr.id)
    } catch { setError('Gagal mencatat pencairan.') } finally { setSaving(false) }
  }
  async function delDisbursement(paymentId: string) {
    if (!kpr || !confirm('Hapus pencairan ini?')) return
    const kprId = kpr.id
    try {
      await kprService.deleteDisbursement(paymentId)
      const list = await kprService.listApplications(clientId)
      setApps(list); setKpr(list.find((a) => a.id === kprId) ?? list[0] ?? null)
      await reloadDisbursements(kprId)
    } catch { setError('Gagal menghapus pencairan.') }
  }

  if (loading) return <div className="py-16 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>

  const curIdx = stageIndex(kpr?.stage)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to="/marketing/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600 mb-1"><ArrowLeft size={14} /> Daftar Pembeli</Link>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Landmark size={18} /> KPR — {client?.full_name ?? 'Pembeli'}</h1>
        </div>
        {/* Tombol tolak hilang setelah akad kredit tersimpan (tak bisa ditolak lagi) */}
        {kpr && !kpr.is_rejected && stageIndex(kpr.stage) < stageIndex('akad_kredit') && (
          <button onClick={openReject} className="btn-secondary text-sm text-red-600 flex items-center gap-2 shrink-0"><XCircle size={14} /> Tolak Pengajuan</button>
        )}
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {kpr?.is_rejected && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2"><XCircle size={15} /> Pengajuan Ditolak {kpr.bank_name ? `(${kpr.bank_name})` : ''}{kpr.rejected_date ? ` · ${new Date(kpr.rejected_date).toLocaleDateString('id-ID')}` : ''}</p>
          {kpr.rejection_reason && <p className="text-sm text-red-600 mt-1">Alasan: {kpr.rejection_reason}</p>}
          <button onClick={createApp} disabled={saving} className="btn-primary text-xs inline-flex items-center gap-2 mt-2">
            {saving && <Loader2 size={13} className="animate-spin" />} <Plus size={13} /> Ajukan Ulang ke Bank Lain
          </button>
        </div>
      )}

      {/* Pengingat saat tahap SP3K — tindak lanjut sebelum akad */}
      {kpr && !kpr.is_rejected && kpr.stage === 'sp3k' && (
        <div className="card p-4 bg-amber-50/50 border-amber-200">
          <p className="text-sm font-semibold text-amber-700 flex items-center gap-2">
            <BellRing size={15} /> SP3K sudah terbit — segera tindak lanjut sebelum akad
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to={`/marketing/clients/${clientId}/tax`} className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition">
              <Scale size={13} /> Bayarkan Pajak
            </Link>
            <Link to="/construction" className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition">
              <HardHat size={13} /> Cek Progres Bangunan
            </Link>
            <Link to={`/marketing/clients/${clientId}/tax`} className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition">
              <FileCheck size={13} /> Cek Dokumen
            </Link>
          </div>
        </div>
      )}

      {apps.length > 1 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100"><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Riwayat Pengajuan KPR ({apps.length})</p></div>
          <ul className="divide-y divide-slate-100">
            {apps.map((a, i) => (
              <li key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-slate-700">{a.bank_name ?? 'Bank belum dipilih'}</span>
                {a.is_rejected
                  ? <span className="text-xs px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200">Ditolak</span>
                  : <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">{STAGES.find((s) => s.key === a.stage)?.label ?? a.stage}</span>}
                {i === 0 && <span className="text-xs text-emerald-600">· terkini</span>}
                <span className="ml-auto text-xs text-slate-400">{a.rejection_reason ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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

          {/* Form — field tahap lanjut baru muncul setelah tahap itu tercapai */}
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
              <div><label className="label">Plafon (Rp)</label><MoneyInput value={kpr.plafond ?? undefined} onChange={(v) => set('plafond', v)} /></div>
              <div><label className="label">Tenor (bulan)</label><input className="input" type="number" min={0} value={kpr.tenor_months ?? ''} onChange={(e) => set('tenor_months', e.target.value ? Number(e.target.value) : undefined)} /></div>
              <div><label className="label">Bunga (%)</label><input className="input" type="number" step="0.01" min={0} value={kpr.interest_rate ?? ''} onChange={(e) => set('interest_rate', e.target.value ? Number(e.target.value) : undefined)} /></div>
            </div>
            <div>
              <label className="label">Tgl Collect Berkas</label>
              <input className="input max-w-[240px]" type="date" value={kpr.submitted_date ?? ''} onChange={(e) => set('submitted_date', e.target.value)} />
              <p className="text-xs text-slate-400 mt-1">Default terisi otomatis dari tanggal pembeli pertama kali dientri.</p>
            </div>
            <div>
              <label className="label">Catatan Collect Berkas</label>
              <textarea className="input" rows={2} placeholder="mis. berkas atas nama berbeda, perlu perubahan nama, dokumen menyusul, dll"
                value={kpr.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
            </div>

            {curIdx >= stageIndex('berkas_masuk_bank') && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-2">Berkas Masuk Bank</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Tgl Pengajuan ke Bank</label>
                    <input className="input" type="date" value={kpr.bank_submission_date ?? ''} onChange={(e) => set('bank_submission_date', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">No. SiKasep/SiKumbang</label>
                    <input className="input" placeholder="untuk subsidi" value={kpr.sikasep_number ?? ''} onChange={(e) => set('sikasep_number', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {curIdx >= stageIndex('sp3k') && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-2">SP3K</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">No. SP3K</label><input className="input" value={kpr.sp3k_number ?? ''} onChange={(e) => set('sp3k_number', e.target.value)} /></div>
                  <div><label className="label">Tgl SP3K</label><input className="input" type="date" value={kpr.sp3k_date ?? ''} onChange={(e) => set('sp3k_date', e.target.value)} /></div>
                </div>
              </div>
            )}

            {curIdx >= stageIndex('akad_kredit') && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-2">Akad Kredit</p>
                <div className="max-w-[240px]">
                  <label className="label">Tgl Akad</label>
                  <input className="input" type="date" value={kpr.akad_date ?? ''} onChange={(e) => set('akad_date', e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              {savedTick > 0 && (
                <span className="text-sm text-emerald-600 flex items-center gap-1.5">
                  <Check size={15} /> Tersimpan
                </span>
              )}
              <button className="btn-primary text-sm flex items-center gap-2" onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
            </div>
          </div>

          {/* Pencairan Bertahap */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Banknote size={16} /> Pencairan Bertahap</p>
              <button className="btn-primary text-xs flex items-center gap-1" onClick={openDisburse}><Plus size={13} /> Tambah Pencairan</button>
            </div>
            {/* Ringkasan plafon / cair / retensi */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
              <div className="p-4 text-center">
                <p className="text-xs text-slate-500">Plafon KPR</p>
                <p className="text-sm font-semibold text-slate-900">{fmt(kpr.plafond)}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-slate-500">Sudah Cair</p>
                <p className="text-sm font-semibold text-emerald-600">{fmt(kpr.total_disbursed)}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-slate-500">Retensi (belum cair)</p>
                <p className="text-sm font-semibold text-amber-600">{fmt(kpr.retention)}</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Tanggal', 'Jumlah', 'Keterangan', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {disbursements.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada pencairan. Klik "Tambah Pencairan" untuk mencatat tahap pertama.</td></tr>
                ) : disbursements.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{d.payment_date ? new Date(d.payment_date).toLocaleDateString('id-ID') : '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-emerald-600">{fmt(d.amount)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.notes ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => delDisbursement(d.id)} className="text-slate-400 hover:text-red-600" title="Hapus pencairan"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-100">
              Tiap pencairan otomatis tercatat sebagai uang masuk (sumber Bank) di menu Pembayaran. Retensi = Plafon − Sudah Cair.
            </p>
          </div>
        </>
      )}

      <Modal open={disModal} onClose={() => setDisModal(false)} title="Tambah Pencairan KPR">
        <form onSubmit={submitDisburse} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Jumlah Pencairan (Rp) *</label><MoneyInput required value={disAmount} onChange={(v) => setDisAmount(v)} /></div>
            <div><label className="label">Tanggal Pencairan</label><input className="input" type="date" value={disDate} onChange={(e) => setDisDate(e.target.value)} /></div>
          </div>
          <div><label className="label">Keterangan</label><input className="input" placeholder="mis. Pencairan tahap 1 / retensi" value={disNotes} onChange={(e) => setDisNotes(e.target.value)} /></div>
          <p className="text-xs text-slate-400">Menandai tahap Pencairan & membuat 1 uang masuk (sumber Bank) di menu Pembayaran. Bisa dicatat beberapa kali (bertahap).</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setDisModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Tolak Pengajuan */}
      <Modal open={rejModal} onClose={() => setRejModal(false)} title="Tolak Pengajuan KPR">
        <form onSubmit={submitReject} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Tanggal Ditolak</label><input className="input" type="date" value={rejDate} onChange={(e) => setRejDate(e.target.value)} /></div>
          </div>
          <div>
            <label className="label">Alasan Penolakan</label>
            <textarea className="input" rows={2} placeholder="mis. SLIK/BI checking, penghasilan tak memenuhi, dll" value={rejReason} onChange={(e) => setRejReason(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={rejCascade} onChange={(e) => setRejCascade(e.target.checked)} />
            <span>Bebaskan unit & tandai pembeli <b>Batal</b> — unit kembali <b>Tersedia</b> untuk dijual ke orang lain.</span>
          </label>
          <p className="text-xs text-slate-400">Data pengajuan TIDAK dihapus — tetap tersimpan sebagai riwayat "Ditolak". Pembeli bisa ajukan ulang ke bank lain.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setRejModal(false)}>Batal</button>
            <button type="submit" className="btn-primary text-sm bg-red-600 hover:bg-red-700 flex items-center gap-2" disabled={saving}>{saving && <Loader2 size={14} className="animate-spin" />}Tolak Pengajuan</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
