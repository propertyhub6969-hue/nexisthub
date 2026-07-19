import { useRef, useEffect, useState } from 'react'
import { Eraser } from 'lucide-react'

interface SignaturePadProps {
  value?: string                       // data URL awal (untuk edit)
  onChange: (dataUrl: string) => void  // dipanggil saat selesai menggores / clear
  width?: number
  height?: number
}

export default function SignaturePad({ value, onChange, width = 440, height = 140 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  // muat tanda tangan lama (mode edit)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      img.src = value
      setHasInk(true)
    } else {
      setHasInk(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current!.getContext('2d')!
    drawing.current = true
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    canvasRef.current!.setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasInk(true)
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvasRef.current!.toDataURL('image/png'))
  }
  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange('')
  }

  return (
    <div>
      <div className="relative rounded-lg border border-slate-200 bg-slate-50 overflow-hidden" style={{ width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 text-sm">
            Tanda tangan di sini
          </span>
        )}
      </div>
      <button type="button" onClick={clear} className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600">
        <Eraser size={12} /> Hapus tanda tangan
      </button>
    </div>
  )
}
