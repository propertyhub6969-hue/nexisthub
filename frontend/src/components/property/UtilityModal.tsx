import { useEffect, useState } from 'react'
import { Loader2, Zap, Droplets, Save, Check } from 'lucide-react'
import Modal from '../ui/Modal'
import DateInput from '../ui/DateInput'
import MoneyInput from '../ui/MoneyInput'
import { propertyService } from '../../services/property'
import type { UnitUtility, UtilityKind, UtilityStatus } from '../../types'

const STATUS_OPTS: { key: UtilityStatus; label: string }[] = [
  { key: 'belum', label: 'Belum diurus' },
  { key: 'diajukan', label: 'Sudah diajukan' },
  { key: 'terpasang', label: 'Terpasang' },
]
const KIND_CFG: Record<UtilityKind, { label: string; icon: typeof Zap; cls: string }> = {
  pln: { label: 'Listrik PLN', icon: Zap, cls: 'text-amber-500' },
  pdam: { label: 'Air PDAM', icon: Droplets, cls: 'text-blue-500' },
}

/** Panel Utilitas satu unit — PLN & PDAM. Biaya yang diisi otomatis tercatat
 *  sebagai biaya proyek (masuk Buku Kas), jadi tak perlu input ganda. */
export default function UtilityModal({ unitId, unitLabel, onClose, onSaved }: {
  unitId: string; unitLabel: string; onClose: () => void; onSaved?: () => void
}) {
  const [rows, setRows] = useState<UnitUtility[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKind, setSavingKind] = useState<UtilityKind | null>(null)
  const [savedKind, setSavedKind] = useState<UtilityKind | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    propertyService.listUnitUtilities(unitId)
      .then(setRows).catch(() => setError('Gagal memuat utilitas.')).finally(() => setLoading(false))
  }, [unitId])

  function patch(kind: UtilityKind, p: Partial<UnitUtility>) {
    setRows((prev) => prev.map((r) => (r.kind === kind ? { ...r, ...p } : r)))
  }

  async function save(kind: UtilityKind) {
    const r = rows.find((x) => x.kind === kind)
    if (!r) return
    setSavingKind(kind); setError('')
    try {
      const saved = await propertyService.saveUnitUtility(unitId, {
        kind, status: r.status, customer_no: r.customer_no || undefined,
        power_va: r.power_va || undefined, applied_date: r.applied_date || undefined,
        installed_date: r.installed_date || undefined, cost: r.cost || undefined,
        notes: r.notes || undefined,
      })
      setRows((prev) => prev.map((x) => (x.kind === kind ? saved : x)))
      setSavedKind(kind); setTimeout(() => setSavedKind(null), 2000)
      onSaved?.()
    } catch { setError('Gagal menyimpan. Coba lagi.') } finally { setSavingKind(null) }
  }

  return (
    <Modal open onClose={onClose} title={`Utilitas — Unit ${unitLabel}`} size="lg">
      <p className="text-sm text-slate-500">
        Sambungan <b>PLN &amp; PDAM</b> wajib <b>Terpasang</b> sebelum unit bisa diserahterimakan (BAST).
        Biaya yang diisi otomatis tercatat sebagai biaya proyek &amp; masuk Buku Kas — tak perlu dicatat ulang di Procurement.
      </p>

      {error && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map((r) => {
            const cfg = KIND_CFG[r.kind]
            const Icon = cfg.icon
            return (
              <div key={r.kind} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    <Icon size={15} className={cfg.cls} /> {cfg.label}
                  </p>
                  {r.status === 'terpasang' && (
                    <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      Siap serah terima
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="label text-xs">Status</label>
                    <select className="input text-sm py-1.5" value={r.status}
                      onChange={(e) => patch(r.kind, { status: e.target.value as UtilityStatus })}>
                      {STATUS_OPTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">{r.kind === 'pln' ? 'ID Pelanggan / No. Meteran' : 'No. Sambungan / Pelanggan'}</label>
                    <input className="input text-sm py-1.5" value={r.customer_no ?? ''}
                      onChange={(e) => patch(r.kind, { customer_no: e.target.value })} />
                  </div>
                  {r.kind === 'pln' ? (
                    <div>
                      <label className="label text-xs">Daya (VA)</label>
                      <input className="input text-sm py-1.5" type="number" min={0} value={r.power_va ?? ''}
                        placeholder="mis. 1300"
                        onChange={(e) => patch(r.kind, { power_va: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                  ) : <div />}

                  <div>
                    <label className="label text-xs">Tgl Diajukan</label>
                    <DateInput className="input text-sm py-1.5" value={r.applied_date ?? ''}
                      onChange={(v) => patch(r.kind, { applied_date: v })} />
                  </div>
                  <div>
                    <label className="label text-xs">Tgl Terpasang</label>
                    <DateInput className="input text-sm py-1.5" value={r.installed_date ?? ''}
                      onChange={(v) => patch(r.kind, { installed_date: v })} />
                  </div>
                  <div>
                    <label className="label text-xs">Biaya Pemasangan</label>
                    <MoneyInput className="input text-sm py-1.5" value={r.cost ?? undefined}
                      onChange={(v) => patch(r.kind, { cost: v })} />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="label text-xs">Catatan</label>
                  <input className="input text-sm py-1.5" value={r.notes ?? ''}
                    onChange={(e) => patch(r.kind, { notes: e.target.value })}
                    placeholder="mis. menunggu jadwal survei petugas" />
                </div>

                <div className="mt-2 flex justify-end">
                  <button onClick={() => save(r.kind)} disabled={savingKind === r.kind}
                    className="btn-primary text-xs flex items-center gap-1.5 py-1.5">
                    {savingKind === r.kind ? <Loader2 size={13} className="animate-spin" />
                      : savedKind === r.kind ? <Check size={13} /> : <Save size={13} />}
                    {savedKind === r.kind ? 'Tersimpan' : `Simpan ${cfg.label}`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
