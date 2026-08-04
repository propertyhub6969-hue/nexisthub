import api from '../services/api'

// Buka file NATIVE/progresif di tab baru: minta URL sekali-pakai (token pendek) dari
// endpoint *-view-url, lalu arahkan tab ke sana. Browser me-render langsung (viewer PDF
// bawaan) sambil mengunduh — jauh lebih cepat terasa daripada unduh-penuh-dulu (blob).
// Tab dibuka SINKRON saat klik (jaga user-gesture, hindari popup blocker).
export async function openViaViewUrl(viewUrlPath: string, params?: Record<string, string>): Promise<void> {
  const tab = window.open('', '_blank')
  try {
    const { data } = await api.get<{ url: string }>(viewUrlPath, { params })
    if (tab) tab.location.href = data.url
    else window.open(data.url, '_blank')   // popup diblokir → coba buka langsung
  } catch (e) {
    if (tab) tab.close()
    throw e
  }
}
