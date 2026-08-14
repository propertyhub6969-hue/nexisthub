import { useEffect, useState } from 'react'
import { Sparkles, Info, AlertTriangle } from 'lucide-react'
import Modal from './ui/Modal'
import { announcementService } from '../services/announcement'
import type { AnnouncementPublic, AnnouncementKind } from '../types'

const KIND_META: Record<AnnouncementKind, { icon: typeof Info; label: string; cls: string }> = {
  feature: { icon: Sparkles, label: 'Fitur Baru', cls: 'text-indigo-700 bg-indigo-50' },
  info: { icon: Info, label: 'Info', cls: 'text-blue-700 bg-blue-50' },
  warning: { icon: AlertTriangle, label: 'Perhatian', cls: 'text-amber-700 bg-amber-50' },
}

// Popup "Kabar Terbaru" — tampil sekali per pengumuman aktif yang belum ditutup user.
// Bila ada beberapa, ditampilkan satu per satu.
export default function WhatsNewModal() {
  const [queue, setQueue] = useState<AnnouncementPublic[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    announcementService.active().then((a) => { if (a.length) { setQueue(a); setIdx(0) } }).catch(() => {})
  }, [])

  if (idx >= queue.length) return null
  const a = queue[idx]
  const meta = KIND_META[a.kind] ?? KIND_META.info
  const Icon = meta.icon
  const remaining = queue.length - idx - 1

  const next = async () => {
    try { await announcementService.dismiss(a.id) } catch { /* diamkan */ }
    setIdx((n) => n + 1)
  }

  return (
    <Modal open onClose={next} title="Kabar Terbaru" size="md">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
            <Icon size={14} /> {meta.label}
          </span>
        </div>
        <h3 className="text-lg font-bold text-slate-900">{a.title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{a.body}</p>
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-400">{remaining > 0 ? `${remaining} pengumuman lagi` : ''}</span>
          <button className="btn-primary" onClick={next}>{remaining > 0 ? 'Berikutnya' : 'Mengerti'}</button>
        </div>
      </div>
    </Modal>
  )
}
