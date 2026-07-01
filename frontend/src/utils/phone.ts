/** Ubah nomor HP lokal (08xx / +62 / 62xx / 8xx) jadi URL wa.me internasional. */
export function waLink(phone?: string): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) digits = '62' + digits.slice(1)
  else if (digits.startsWith('62')) { /* sudah internasional */ }
  else if (digits.startsWith('8')) digits = '62' + digits
  return `https://wa.me/${digits}`
}
