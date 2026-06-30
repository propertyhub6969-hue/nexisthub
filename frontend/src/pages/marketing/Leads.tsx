import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import type { LeadStatus } from '../../types'

// Dummy data — akan diganti API calls di sprint berikutnya
const dummyLeads = [
  {
    id: '1',
    full_name: 'Budi Santoso',
    phone: '08123456789',
    email: 'budi@gmail.com',
    source: 'Instagram',
    interest: 'Tipe 45',
    status: 'NEW' as LeadStatus,
    created_at: '2026-06-28T10:00:00Z',
  },
  {
    id: '2',
    full_name: 'Siti Rahayu',
    phone: '08234567890',
    email: 'siti@gmail.com',
    source: 'Referral',
    interest: 'Tipe 60',
    status: 'CONTACTED' as LeadStatus,
    created_at: '2026-06-29T09:00:00Z',
  },
  {
    id: '3',
    full_name: 'Agus Hermawan',
    phone: '08345678901',
    email: 'agus@gmail.com',
    source: 'Website',
    interest: 'Tipe 36',
    status: 'QUALIFIED' as LeadStatus,
    created_at: '2026-06-30T08:00:00Z',
  },
]

const statusConfig: Record<LeadStatus, { label: string; variant: 'blue' | 'yellow' | 'green' | 'gray' }> = {
  NEW:          { label: 'Baru',          variant: 'blue' },
  CONTACTED:    { label: 'Dihubungi',     variant: 'yellow' },
  QUALIFIED:    { label: 'Tervalidasi',   variant: 'green' },
  UNQUALIFIED:  { label: 'Tidak Sesuai', variant: 'gray' },
}

export default function Leads() {
  const [search, setSearch] = useState('')

  const filtered = dummyLeads.filter((l) =>
    l.full_name.toLowerCase().includes(search.toLowerCase()) ||
    l.phone.includes(search)
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8"
            placeholder="Cari nama atau nomor HP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14} />
          Tambah Lead
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Nama', 'No. HP', 'Email', 'Sumber', 'Minat', 'Status', 'Tanggal'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Belum ada lead. Klik "Tambah Lead" untuk mulai.
                </td>
              </tr>
            ) : (
              filtered.map((lead) => {
                const s = statusConfig[lead.status]
                return (
                  <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{lead.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.phone}</td>
                    <td className="px-4 py-3 text-slate-500">{lead.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{lead.source ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{lead.interest ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge label={s.label} variant={s.variant} />
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(lead.created_at).toLocaleDateString('id-ID')}
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
