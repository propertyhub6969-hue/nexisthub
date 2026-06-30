import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import type { ProspectStatus } from '../../types'

const dummyProspects = [
  { id: '1', lead_name: 'Agus Hermawan', unit_type: 'Tipe 36', budget: 350000000, status: 'ACTIVE' as ProspectStatus, created_at: '2026-06-30T08:00:00Z' },
  { id: '2', lead_name: 'Dewi Lestari',  unit_type: 'Tipe 60', budget: 650000000, status: 'NEGOTIATION' as ProspectStatus, created_at: '2026-06-29T08:00:00Z' },
]

const statusConfig: Record<ProspectStatus, { label: string; variant: 'blue' | 'yellow' | 'green' | 'red' }> = {
  ACTIVE:      { label: 'Aktif',      variant: 'blue' },
  NEGOTIATION: { label: 'Negosiasi', variant: 'yellow' },
  WON:         { label: 'Menang',    variant: 'green' },
  LOST:        { label: 'Kalah',     variant: 'red' },
}

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

export default function Prospects() {
  const [search, setSearch] = useState('')
  const filtered = dummyProspects.filter((p) =>
    p.lead_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Cari nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} />
          Tambah Prospect
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nama Lead', 'Tipe Unit', 'Budget', 'Status', 'Tanggal'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Belum ada prospect.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const s = statusConfig[p.status]
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.lead_name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.unit_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.budget ? fmt(p.budget) : '—'}</td>
                    <td className="px-4 py-3"><Badge label={s.label} variant={s.variant} /></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(p.created_at).toLocaleDateString('id-ID')}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
