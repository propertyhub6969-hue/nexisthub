import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Silent refresh ──────────────────────────────────────────────────
// Saat access token (30 mnt) habis → tukar diam-diam pakai refresh token (7 hari),
// lalu ulangi request-nya. User tak ter-lempar ke login saat sedang bekerja.
let isRefreshing = false
let waiters: Array<(token: string | null) => void> = []

function flush(token: string | null) {
  waiters.forEach((cb) => cb(token))
  waiters = []
}

function hardLogout() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  if (window.location.pathname !== '/login') window.location.href = '/login'
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const url: string = original?.url || ''

    // Hanya tangani 401, sekali retry saja, & abaikan endpoint auth/publik
    if (
      status !== 401 ||
      !original ||
      original._retry ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/login') ||
      url.includes('/public/')
    ) {
      return Promise.reject(error)
    }

    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) {
      hardLogout()
      return Promise.reject(error)
    }

    original._retry = true

    // Sudah ada proses refresh berjalan → antre, lalu ulangi begitu token baru siap
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        waiters.push((token) => {
          if (token) {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          } else {
            reject(error)
          }
        })
      })
    }

    isRefreshing = true
    try {
      // axios polos (tanpa interceptor ini) supaya tak memicu loop
      const { data } = await axios.post('/api/v1/auth/refresh', { refresh_token: refresh })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      isRefreshing = false
      flush(data.access_token)
      original.headers.Authorization = `Bearer ${data.access_token}`
      return api(original)
    } catch (e) {
      isRefreshing = false
      flush(null)
      hardLogout()   // refresh token pun mati/ditolak (mis. langganan suspend) → login ulang
      return Promise.reject(e)
    }
  }
)

export default api
