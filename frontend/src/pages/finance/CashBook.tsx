import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Wallet, TrendingUp, TrendingDown, Scale, ChevronLeft, ChevronRight, Landmark, Banknote, Plus, ArrowLeftRight, Settings2, Star, Trash2, Download, Upload } from 'lucide-react'
import DateInput from '../../components/ui/DateInput'
import MoneyInput from '../../components/ui/MoneyInput'
import Modal from '../../components/ui/Modal'
import { cashbookService } from '../../services/cashbook'
import type { AccountCategory, CashBookEntry, CashBookSummary, CashDirection, CashAccount, CashAccountsSummary, MutationImportResult, OpexCategory, OperationalExpense, OpexList } from '../../types'

const fmt = (n?: number) =>
  n == null ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—'

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return `${monthLabels[Number(m) - 1] ?? m} ${y}`
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-medium uppercase tracking-wider truncate">{label}</span></div>
      <div className={`mt-2 text-base sm:text-xl font-semibold truncate ${accent ?? 'text-slate-900'}`} title={value}>{value}</div>
    </div>
  )
}

export default function CashBook() {
  const [summary, setSummary] = useState<CashBookSummary | null>(null)
  const [categories, setCategories] = useState<AccountCategory[]>([])
  const [entries, setEntries] = useState<CashBookEntry[]>([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [direction, setDirection] = useState<CashDirection | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountId, setAccountId] = useState('')
  const [loading, setLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [error, setError] = useState('')
  // rekening kas/bank
  const [accts, setAccts] = useState<CashAccountsSummary | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [tab, setTab] = useState<'ringkasan' | 'transaksi' | 'operasional'>('ringkasan')

  const loadAccounts = useCallback(() => {
    cashbookService.listAccounts().then(setAccts).catch(() => {})
  }, [])
  useEffect(() => { loadAccounts() }, [loadAccounts])

  const loadSummary = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [sm, cats] = await Promise.all([
        cashbookService.summary({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
        cashbookService.listCategories(),
      ])
      setSummary(sm); setCategories(cats)
    } catch { setError('Gagal memuat rekap Buku Kas.') } finally { setLoading(false) }
  }, [dateFrom, dateTo])

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true)
    try {
      const res = await cashbookService.listEntries({
        direction: direction || undefined, category_id: categoryId || undefined,
        account_id: accountId === '__none__' ? undefined : (accountId || undefined),
        unassigned: accountId === '__none__' || undefined,
        date_from: dateFrom || undefined, date_to: dateTo || undefined, page, size: 20,
      })
      setEntries(res.items); setEntriesTotal(res.total)
    } catch { setError('Gagal memuat daftar transaksi.') } finally { setEntriesLoading(false) }
  }, [direction, categoryId, accountId, dateFrom, dateTo, page])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadEntries() }, [loadEntries])
  useEffect(() => { setPage(1) }, [direction, categoryId, accountId, dateFrom, dateTo])

  async function reassign(entryId: string, accId: string) {
    try {
      await cashbookService.reassignEntryAccount(entryId, accId || null)
      loadEntries(); loadAccounts()
    } catch { setError('Gagal memindahkan rekening.') }
  }

  const maxMonth = Math.max(1, ...(summary?.months.map((m) => Math.max(m.total_in, m.total_out)) ?? [1]))
  const pages = Math.max(1, Math.ceil(entriesTotal / 20))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Wallet size={20} className="text-brand-600" /> Buku Kas</h1>
        <p className="text-sm text-slate-500">Rekap kas otomatis dari pembayaran disetujui & biaya yang sudah dibayar, per kategori.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>}

      {/* Saldo per Rekening */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-600">Saldo per Rekening</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setReconcileOpen(true)} disabled={(accts?.accounts.length ?? 0) === 0}
              className="btn-secondary text-sm inline-flex items-center gap-1.5 disabled:opacity-40"><Scale size={14} /> Rekonsiliasi</button>
            <button onClick={() => setTransferOpen(true)} disabled={(accts?.accounts.length ?? 0) < 2}
              className="btn-secondary text-sm inline-flex items-center gap-1.5 disabled:opacity-40"><ArrowLeftRight size={14} /> Transfer</button>
            <button onClick={() => setManageOpen(true)} className="btn-secondary text-sm inline-flex items-center gap-1.5"><Settings2 size={14} /> Kelola Rekening</button>
          </div>
        </div>
        {!accts || accts.accounts.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-400">
            Belum ada rekening. Klik <b>Kelola Rekening</b> untuk menambah kas/bank + saldo awal (mis. per 1 Jan 2026).
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {accts.accounts.map((a) => (
              <button key={a.id} onClick={() => { setAccountId(a.id); setTab('transaksi') }}
                className={`card p-3 text-left hover:ring-2 hover:ring-brand-200 transition ${accountId === a.id ? 'ring-2 ring-brand-400' : ''}`}>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  {a.kind === 'bank' ? <Landmark size={13} /> : <Banknote size={13} />}
                  <span className="truncate">{a.name}</span>
                  {a.is_default && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
                </div>
                <div className="mt-1 font-display text-base font-bold text-slate-900 truncate" title={fmt(a.balance)}>{fmt(a.balance)}</div>
              </button>
            ))}
            <div className="card p-3 bg-slate-50/60">
              <div className="text-xs text-slate-400">Total Semua Rekening</div>
              <div className="mt-1 font-display text-base font-bold text-brand-700 truncate">{fmt(accts.total_balance)}</div>
              {accts.unassigned_balance !== 0 && (
                <button onClick={() => { setAccountId('__none__'); setTab('transaksi') }} className="mt-1 text-[11px] text-amber-600 hover:underline">
                  Belum berrekening: {fmt(accts.unassigned_balance)} →
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter periode (mempengaruhi rekap & daftar) */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Dari Tanggal</label>
          <DateInput className="input" value={dateFrom} onChange={setDateFrom} />
        </div>
        <div>
          <label className="label">Sampai Tanggal</label>
          <DateInput className="input" value={dateTo} onChange={setDateTo} />
        </div>
        {(dateFrom || dateTo) && (
          <button className="btn-secondary text-sm" onClick={() => { setDateFrom(''); setDateTo('') }}>Reset periode</button>
        )}
      </div>

      {/* Tab: Ringkasan (analitik) vs Transaksi (buku besar) */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([['ringkasan', 'Ringkasan'], ['transaksi', 'Transaksi'], ['operasional', 'Biaya Operasional']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${tab === key ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'ringkasan' && (loading ? (
        <div className="card p-12 text-center text-slate-400"><Loader2 size={20} className="inline animate-spin" /></div>
      ) : summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard icon={<TrendingUp size={15} />} label="Kas Masuk" value={fmt(summary.total_in)} accent="text-emerald-600" />
            <StatCard icon={<TrendingDown size={15} />} label="Kas Keluar" value={fmt(summary.total_out)} accent="text-red-600" />
            <StatCard icon={<Scale size={15} />} label="Saldo Periode" value={fmt(summary.saldo)} accent={summary.saldo >= 0 ? 'text-brand-600' : 'text-red-600'} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Rekap per Kategori</h3>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Kategori</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Arah</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.by_category.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-sm">Belum ada transaksi.</td></tr>
                  ) : summary.by_category.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{c.category_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${c.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {c.direction === 'in' ? 'Masuk' : 'Keluar'}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium ${c.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Tren Bulanan</h3>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Bulan</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Masuk</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Keluar</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-40">Komposisi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.months.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada transaksi.</td></tr>
                  ) : summary.months.map((m) => (
                    <tr key={m.month} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{fmtMonth(m.month)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{m.total_in ? fmt(m.total_in) : '—'}</td>
                      <td className="px-4 py-3 text-right text-red-600">{m.total_out ? fmt(m.total_out) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5 w-36">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(m.total_in / maxMonth) * 100}%` }} />
                          <div className="h-2 rounded-full bg-red-500" style={{ width: `${(m.total_out / maxMonth) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ))}

      {tab === 'transaksi' && (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-600">Daftar Transaksi</h3>
          <div className="flex items-center gap-2">
            <select className="input text-sm" value={direction} onChange={(e) => setDirection(e.target.value as CashDirection | '')}>
              <option value="">Semua Arah</option>
              <option value="in">Masuk</option>
              <option value="out">Keluar</option>
            </select>
            <select className="input text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Semua Kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input text-sm" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Semua Rekening</option>
              {accts?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="__none__">— Belum berrekening —</option>
            </select>
          </div>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Tanggal', 'Deskripsi', 'Kategori', 'Konteks', 'Rekening', 'Arah', 'Nominal'].map((h, i) => (
                <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entriesLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-sm">Tidak ada transaksi.</td></tr>
              ) : entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{e.description}</td>
                  <td className="px-4 py-2.5 text-slate-500">{e.category_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">
                    {e.client_id ? <Link to={`/marketing/clients/${e.client_id}/payments`} className="hover:text-brand-600 hover:underline">{e.client_name}</Link>
                      : e.project_name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <select value={e.account_id ?? ''} onChange={(ev) => reassign(e.id, ev.target.value)}
                      className={`text-xs rounded-md border px-1.5 py-1 max-w-[130px] ${e.account_id ? 'border-slate-200 text-slate-600' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
                      <option value="">— belum —</option>
                      {accts?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${e.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {e.direction === 'in' ? 'Masuk' : 'Keluar'}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 font-medium ${e.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between mt-2 text-sm text-slate-500">
            <span>Halaman {page} dari {pages} ({entriesTotal} transaksi)</span>
            <div className="flex items-center gap-1">
              <button className="btn-secondary p-1.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              <button className="btn-secondary p-1.5" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
      )}

      {tab === 'operasional' && <OperationalExpenseTab accounts={accts?.accounts ?? []} onChanged={() => { loadAccounts() }} />}

      {manageOpen && (
        <ManageAccountsModal accounts={accts?.accounts ?? []} onClose={() => setManageOpen(false)}
          onChanged={() => { loadAccounts(); loadEntries() }} />
      )}
      {transferOpen && (
        <TransferModal accounts={accts?.accounts ?? []} onClose={() => setTransferOpen(false)}
          onDone={() => { setTransferOpen(false); loadAccounts() }} />
      )}
      {reconcileOpen && (
        <ReconcileModal accounts={accts?.accounts ?? []} initialAccountId={accountId && accountId !== '__none__' ? accountId : (accts?.accounts[0]?.id ?? '')}
          onClose={() => setReconcileOpen(false)} onSaved={() => { loadAccounts(); loadEntries() }} />
      )}
    </div>
  )
}

// ── Rekonsiliasi manual: cocokkan saldo buku vs mutasi bank ──
function ReconcileModal({ accounts, initialAccountId, onClose, onSaved }:
  { accounts: CashAccount[]; initialAccountId: string; onClose: () => void; onSaved: () => void }) {
  const [accId, setAccId] = useState(initialAccountId)
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [view, setView] = useState<import('../../types').ReconcileView | null>(null)
  const [stmtBalance, setStmtBalance] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [mutFile, setMutFile] = useState<File | null>(null)
  const [mutResult, setMutResult] = useState<MutationImportResult | null>(null)
  const [mutBusy, setMutBusy] = useState(false)
  const mutRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!accId) return
    setLoading(true)
    try { setView(await cashbookService.reconcileView(accId, asOf)) }
    catch { setMsg('Gagal memuat rekonsiliasi.') } finally { setLoading(false) }
  }, [accId, asOf])

  async function mutPreview(f: File) {
    setMutBusy(true); setMutResult(null)
    try { setMutResult(await cashbookService.importMutations(accId, f, true)) }
    catch { setMsg('Gagal membaca file mutasi.') } finally { setMutBusy(false) }
  }
  async function mutApply() {
    if (!mutFile) return
    setMutBusy(true)
    try { setMutResult(await cashbookService.importMutations(accId, mutFile, false)); load() }
    catch { setMsg('Gagal menerapkan.') } finally { setMutBusy(false) }
  }
  useEffect(() => { load() }, [load])

  async function toggle(m: import('../../types').ReconMovement) {
    if (m.kind === 'entry') await cashbookService.setEntryCleared(m.id, !m.is_cleared)
    else await cashbookService.setTransferCleared(m.id, !m.is_cleared)
    load()
  }

  const stmt = Number(stmtBalance || 0)
  const diff = view ? stmt - view.cleared_balance : 0

  async function save() {
    if (!accId) return
    setSaving(true); setMsg('')
    try {
      await cashbookService.saveReconcile(accId, { statement_date: asOf, statement_balance: stmt, note: note || undefined })
      setMsg('Rekonsiliasi tersimpan.'); onSaved()
    } catch { setMsg('Gagal menyimpan.') } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Rekonsiliasi Rekening" size="xl">
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="label">Rekening</label>
            <select className="input text-sm" value={accId} onChange={(e) => setAccId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">Per Tanggal</label><DateInput className="input text-sm" value={asOf} onChange={setAsOf} /></div>
          <div><label className="label">Saldo Bank (rek. koran)</label>
            <input className="input text-sm" type="number" value={stmtBalance} onChange={(e) => setStmtBalance(e.target.value)} placeholder="0" />
          </div>
          <div className="flex items-end">
            <div className={`w-full rounded-lg px-3 py-2 text-sm ${diff === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              Selisih: <b>{fmt(diff)}</b>{diff === 0 ? ' ✓ cocok' : ''}
            </div>
          </div>
        </div>

        {view && (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="text-xs text-slate-400">Saldo Buku</span><div className="font-semibold text-slate-800">{fmt(view.book_balance)}</div></div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="text-xs text-slate-400">Saldo Cleared</span><div className="font-semibold text-blue-600">{fmt(view.cleared_balance)}</div></div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2"><span className="text-xs text-slate-400">Saldo Awal</span><div className="font-semibold text-slate-500">{fmt(view.opening_balance)}</div></div>
          </div>
        )}

        <p className="text-xs text-slate-400">Centang tiap transaksi yang <b>sudah muncul di rekening koran</b>. Saldo Cleared harus sama dengan Saldo Bank agar cocok (selisih 0).</p>

        {/* Impor mutasi bank → auto-centang */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Impor Mutasi Bank (auto-cocok):</span>
            <button onClick={() => cashbookService.downloadMutationsTemplate()} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"><Download size={12} /> Template</button>
            <input ref={mutRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; setMutFile(f); if (f) mutPreview(f) }} />
            <button onClick={() => mutRef.current?.click()} disabled={mutBusy} className="btn-secondary text-xs inline-flex items-center gap-1"><Upload size={12} /> Pilih file mutasi</button>
            {mutFile && <span className="text-xs text-slate-500 truncate max-w-[160px]">{mutFile.name}</span>}
            {mutBusy && <Loader2 size={13} className="animate-spin text-slate-400" />}
          </div>
          {mutResult && (
            <div className="mt-2 text-xs text-slate-600">
              Cocok: <b className="text-emerald-600">{mutResult.matched}</b> · Tak cocok: <b className={mutResult.no_match ? 'text-amber-600' : 'text-slate-400'}>{mutResult.no_match}</b> dari {mutResult.total} baris.
              {mutResult.no_match > 0 && <span className="text-slate-400"> (baris tak cocok = mutasi belum tercatat: biaya admin, bunga, dll)</span>}
              {mutResult.dry_run && mutResult.matched > 0 && (
                <button onClick={mutApply} disabled={mutBusy} className="ml-2 btn-primary text-xs">Terapkan — centang {mutResult.matched}</button>
              )}
              {!mutResult.dry_run && <span className="ml-2 text-emerald-600 font-medium">✓ {mutResult.matched} transaksi tercentang</span>}
            </div>
          )}
        </div>

        <div className="overflow-x-auto max-h-[45vh] border border-slate-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 w-12">Cocok</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Uraian</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Masuk</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Keluar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
              ) : !view || view.movements.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400 text-sm">Tidak ada transaksi s/d tanggal ini.</td></tr>
              ) : view.movements.map((m) => (
                <tr key={m.kind + m.id} className={m.is_cleared ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={m.is_cleared} onChange={() => toggle(m)} className="accent-emerald-600" />
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{fmtDate(m.date)}</td>
                  <td className="px-3 py-2 text-slate-700">{m.description}{m.kind === 'transfer' && <span className="ml-1 text-[10px] text-slate-400">(transfer)</span>}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">{m.direction === 'in' ? fmt(m.amount) : '—'}</td>
                  <td className="px-3 py-2 text-right text-red-600">{m.direction === 'out' ? fmt(m.amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <input className="input text-sm w-full" placeholder="Catatan rekonsiliasi (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {msg && <p className={`text-sm ${msg.includes('tersimpan') ? 'text-emerald-600' : 'text-red-600'}`}>{msg}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary text-sm" onClick={onClose}>Tutup</button>
          <button className="btn-primary text-sm inline-flex items-center gap-1.5" onClick={save} disabled={saving || !view}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Scale size={14} />} Simpan Rekonsiliasi
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Kelola Rekening (CRUD + saldo awal + default) ──
function ManageAccountsModal({ accounts, onClose, onChanged }: { accounts: CashAccount[]; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<CashAccount[]>(accounts)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{ name: string; kind: 'kas' | 'bank'; bank_name: string; account_number: string; opening_balance: string; opening_date: string }>({
    name: '', kind: 'bank', bank_name: '', account_number: '', opening_balance: '', opening_date: '2026-01-01',
  })
  useEffect(() => { setRows(accounts) }, [accounts])

  async function add() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await cashbookService.createAccount({
        name: form.name.trim(), kind: form.kind, bank_name: form.bank_name || undefined,
        account_number: form.account_number || undefined,
        opening_balance: Number(form.opening_balance || 0), opening_date: form.opening_date || undefined,
        is_default: accounts.length === 0,
      })
      setForm({ ...form, name: '', bank_name: '', account_number: '', opening_balance: '' })
      onChanged()
    } finally { setSaving(false) }
  }
  async function saveOpening(a: CashAccount, val: string) {
    await cashbookService.updateAccount(a.id, { opening_balance: Number(val || 0) }); onChanged()
  }
  async function setDefault(a: CashAccount) { await cashbookService.setDefaultAccount(a.id); onChanged() }
  async function del(a: CashAccount) {
    if (!window.confirm(`Hapus rekening "${a.name}"? Transaksi yang menunjuk rekening ini akan jadi "belum berrekening".`)) return
    await cashbookService.deleteAccount(a.id); onChanged()
  }

  return (
    <Modal open onClose={onClose} title="Kelola Rekening Kas & Bank" size="lg">
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['Rekening', 'No. Rekening', 'Saldo Awal', 'Saldo Kini', 'Default', ''].map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">Belum ada rekening.</td></tr>
              ) : rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">{a.kind === 'bank' ? <Landmark size={13} className="text-slate-400" /> : <Banknote size={13} className="text-slate-400" />}{a.name}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{a.account_number || '—'}</td>
                  <td className="px-3 py-2">
                    <input type="number" defaultValue={Number(a.opening_balance)} onBlur={(e) => saveOpening(a, e.target.value)}
                      className="input text-sm w-32 py-1" />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{fmt(a.balance)}</td>
                  <td className="px-3 py-2">
                    {a.is_default ? <span className="text-amber-500 inline-flex items-center gap-1 text-xs"><Star size={12} className="fill-amber-400" /> Default</span>
                      : <button onClick={() => setDefault(a)} className="text-xs text-slate-400 hover:text-amber-600">Jadikan default</button>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => del(a)} className="text-slate-300 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400">Rekening <b>Default</b> = rekening awal untuk transaksi baru; bisa dipindah per transaksi di daftar. Ubah saldo awal langsung di kolomnya (klik keluar untuk simpan).</p>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold text-slate-700 mb-2">Tambah Rekening</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <input className="input text-sm" placeholder="Nama (mis. BCA Operasional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="input text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'kas' | 'bank' })}>
              <option value="bank">Bank</option><option value="kas">Kas Tunai</option>
            </select>
            <input className="input text-sm" placeholder="No. Rekening (opsional)" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
            <input className="input text-sm" type="number" placeholder="Saldo awal" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            <DateInput className="input text-sm" value={form.opening_date} onChange={(v) => setForm({ ...form, opening_date: v })} />
            <button onClick={add} disabled={saving || !form.name.trim()} className="btn-primary text-sm inline-flex items-center justify-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Tambah
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Transfer antar rekening ──
function TransferModal({ accounts, onClose, onDone }: { accounts: CashAccount[]; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState(accounts[0]?.id ?? '')
  const [to, setTo] = useState(accounts[1]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [dt, setDt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    if (from === to) { setErr('Rekening asal & tujuan tak boleh sama.'); return }
    if (!Number(amount)) { setErr('Jumlah harus lebih dari 0.'); return }
    setSaving(true)
    try {
      await cashbookService.createTransfer({ from_account_id: from, to_account_id: to, amount: Number(amount), date: dt, notes: notes || undefined })
      onDone()
    } catch (e: any) { setErr(e?.response?.data?.detail ?? 'Gagal membuat transfer.') } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Transfer Antar Rekening">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Pindah dana antar rekening — bukan pemasukan/pengeluaran, tak masuk laporan laba/rugi.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Dari</label>
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
            </select>
          </div>
          <div><label className="label">Ke</label>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Jumlah</label>
            <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div><label className="label">Tanggal</label>
            <DateInput className="input" value={dt} onChange={setDt} />
          </div>
        </div>
        <div><label className="label">Catatan (opsional)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary text-sm" onClick={onClose}>Batal</button>
          <button className="btn-primary text-sm inline-flex items-center gap-1.5" onClick={submit} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />} Transfer
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tab Biaya Operasional (overhead perusahaan, non-proyek) ──
function OperationalExpenseTab({ accounts, onChanged }: { accounts: CashAccount[]; onChanged: () => void }) {
  const [data, setData] = useState<OpexList | null>(null)
  const [cats, setCats] = useState<OpexCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [catOpen, setCatOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([cashbookService.listOpex(), cashbookService.listOpexCategories()])
      .then(([d, c]) => { setData(d); setCats(c) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (o: OperationalExpense) => {
    if (!confirm(`Hapus biaya "${o.description}"?`)) return
    await cashbookService.deleteOpex(o.id); load(); onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 max-w-xl">Biaya operasional perusahaan (gaji, sewa, dll). Masuk Arus Kas, tapi <b>tidak</b> dibebankan ke proyek — jadi Laba/Rugi per proyek tetap akurat.</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setCatOpen(true)} className="btn-secondary text-sm inline-flex items-center gap-1.5"><Settings2 size={14} /> Kelola Kategori</button>
          <button onClick={() => setAddOpen(true)} className="btn-primary text-sm inline-flex items-center gap-1.5"><Plus size={14} /> Catat Biaya</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-xs text-slate-500">Total Dibayar</div><div className="mt-1 font-display text-lg font-bold text-red-600 truncate">{fmt(data?.total)}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Belum Dibayar</div><div className="mt-1 font-display text-lg font-bold text-amber-600 truncate">{fmt(data?.total_unpaid)}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Jumlah Catatan</div><div className="mt-1 font-display text-lg font-bold text-slate-900">{data?.rows.length ?? 0}</div></div>
      </div>

      {data && data.by_category.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.by_category.map((b) => (
            <span key={b.name} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1">
              {b.name} <b className="text-slate-800">{fmt(b.total)}</b>
            </span>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>{['Tanggal', 'Deskripsi', 'Kategori', 'Status', 'Nominal', ''].map((h, i) => (
              <th key={i} className={`px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider ${i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
            ) : !data || data.rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada biaya operasional. Klik <b>Catat Biaya</b>.</td></tr>
            ) : data.rows.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(o.expense_date ?? undefined)}</td>
                <td className="px-4 py-2.5 text-slate-700">{o.description}</td>
                <td className="px-4 py-2.5 text-slate-500">{o.category_name ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${o.is_paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{o.is_paid ? 'Dibayar' : 'Belum'}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-red-600">{fmt(o.amount)}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => remove(o)} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && <OpexAddModal accounts={accounts} cats={cats} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); onChanged() }}
        onCatsChanged={() => cashbookService.listOpexCategories().then(setCats)} />}
      {catOpen && <OpexCategoriesModal cats={cats} onClose={() => setCatOpen(false)} onChanged={() => { cashbookService.listOpexCategories().then(setCats) }} />}
    </div>
  )
}

function OpexAddModal({ accounts, cats, onClose, onSaved, onCatsChanged }: { accounts: CashAccount[]; cats: OpexCategory[]; onClose: () => void; onSaved: () => void; onCatsChanged?: () => void }) {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState<number | undefined>(undefined)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [catList, setCatList] = useState<OpexCategory[]>(cats)
  const [catId, setCatId] = useState('')
  const [newCatMode, setNewCatMode] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  const [acctId, setAcctId] = useState(accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? '')
  const [isPaid, setIsPaid] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const addCat = async () => {
    if (!newCatName.trim()) return
    setCatBusy(true)
    try {
      const c = await cashbookService.createOpexCategory(newCatName.trim())
      setCatList((l) => [...l, c]); setCatId(c.id); setNewCatName(''); setNewCatMode(false); onCatsChanged?.()
    } catch { /* toast */ } finally { setCatBusy(false) }
  }

  const save = async () => {
    if (!desc.trim() || !amount) { setErr('Deskripsi & nominal wajib diisi.'); return }
    setSaving(true); setErr('')
    try {
      await cashbookService.createOpex({
        description: desc.trim(), amount, expense_date: date || undefined,
        opex_category_id: catId || undefined, cash_account_id: isPaid ? (acctId || undefined) : undefined,
        is_paid: isPaid,
      })
      onSaved()
    } catch { setErr('Gagal menyimpan.') } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="Catat Biaya Operasional" size="md">
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{err}</div>}
        <div><label className="label">Deskripsi</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. Gaji karyawan Agustus" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Nominal</label><MoneyInput value={amount} onChange={setAmount} /></div>
          <div><label className="label">Tanggal</label><DateInput className="input" value={date} onChange={setDate} /></div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label">Kategori</label>
            {!newCatMode && (
              <button type="button" onClick={() => setNewCatMode(true)} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5"><Plus size={12} /> Kategori baru</button>
            )}
          </div>
          {newCatMode ? (
            <div className="flex gap-2">
              <input className="input flex-1" value={newCatName} autoFocus onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nama kategori baru" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat() } }} />
              <button type="button" className="btn-primary text-sm" onClick={addCat} disabled={catBusy}>{catBusy ? <Loader2 size={14} className="animate-spin" /> : 'Simpan'}</button>
              <button type="button" className="btn-secondary text-sm" onClick={() => { setNewCatMode(false); setNewCatName('') }}>Batal</button>
            </div>
          ) : (
            <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">— Pilih kategori —</option>
              {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /> Sudah dibayar (langsung tercatat keluar dari kas)
        </label>
        {isPaid && (
          <div><label className="label">Dibayar dari rekening</label>
            <select className="input" value={acctId} onChange={(e) => setAcctId(e.target.value)}>
              <option value="">— Rekening default —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : 'Simpan'}</button>
        </div>
      </div>
    </Modal>
  )
}

function OpexCategoriesModal({ cats, onClose, onChanged }: { cats: OpexCategory[]; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = useState<OpexCategory[]>(cats)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => cashbookService.listOpexCategories().then((c) => { setList(c); onChanged() })

  const add = async () => {
    if (!name.trim()) return
    setBusy(true)
    try { await cashbookService.createOpexCategory(name.trim()); setName(''); await refresh() } finally { setBusy(false) }
  }
  const del = async (c: OpexCategory) => {
    if (!confirm(`Hapus kategori "${c.name}"? Biaya lama tetap tersimpan.`)) return
    await cashbookService.deleteOpexCategory(c.id); refresh()
  }

  return (
    <Modal open onClose={onClose} title="Kelola Kategori Biaya Operasional" size="md">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tambah kategori (mis. Konsultan)" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary text-sm" onClick={add} disabled={busy}><Plus size={14} /></button>
        </div>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
          {list.length === 0 ? <p className="p-4 text-center text-slate-400 text-sm">Belum ada kategori.</p> :
            list.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm text-slate-700">{c.name}</span>
                <button onClick={() => del(c)} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
        </div>
        <div className="flex justify-end"><button className="btn-secondary text-sm" onClick={onClose}>Tutup</button></div>
      </div>
    </Modal>
  )
}
