import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import type { ClientStatus } from '../../types'

const dummyClients = [
  { id: '1', name: 'Dewi Lestari',  unit_number: 'A-12', contract_value: 650000000, contract_date: '2026-06-15', status: 'ACTIVE' as ClientStatus },
  { id: '2', name: 'Rudi Wijaya',   unit_number: 'B-05', contract_value: 420000000, contract_date: '2026-05-20', status: 'COMPLETED' as ClientStatus },
]

const statusConfig: Record<ClientStatus, { label: string; variant: 'green' | 'blue' | 'gray' }> = {
  ACTIVE:    { label: 'Aktif',    variant: 'green' },
  COMPLETED: { label: 'Selesai', variant: 'blue' },
  INACTIVE:  { label: 'Nonaktif', variant: 'gray' },
}

const fmt = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

export default function Clients() {
  const [search, setSearch] = useState('')
  const filtered = dummyClients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.unit_number.includes(search)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Cari nama atau unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} />
          Tambah Client
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nama Client', 'No. Unit', 'Nilai Kontrak', 'Tgl Kontrak', 'Status'].map((h) => (
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
                  Belum ada client.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const s = statusConfig[c.status]
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.unit_number}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(c.contract_value)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(c.contract_date).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3"><Badge label={s.label} variant={s.variant} /></td>
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
