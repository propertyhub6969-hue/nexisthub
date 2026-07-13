// Tanggal hari ini (zona waktu lokal perangkat) format YYYY-MM-DD.
// Dipakai sebagai `max` pada input tanggal PERISTIWA NYATA (mis. tgl bayar, collect berkas,
// opname, BAST) agar tak bisa diisi tanggal masa depan → cegah data janggal & durasi negatif.
// TIDAK dipakai pada tanggal rencana/target (Target selesai, Jatuh Tempo, Periode, Aktif s/d).
export function today(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
