interface PaginationProps {
  page: number
  pages: number
  total: number
  onPage: (p: number) => void
}

// Kontrol paginasi server-side (Prev/Next). Sembunyi bila tak ada data.
export default function Pagination({ page, pages, total, onPage }: PaginationProps) {
  if (total === 0) return null
  const last = Math.max(pages, 1)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-500 border-t border-slate-100">
      <span>{total} data · Halaman {page} dari {last}</span>
      <div className="flex items-center gap-1.5">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">‹ Sebelumnya</button>
        <button disabled={page >= last} onClick={() => onPage(page + 1)}
          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">Berikutnya ›</button>
      </div>
    </div>
  )
}
