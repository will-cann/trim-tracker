import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Flashlight, FlashlightOff } from 'lucide-react'

interface Props {
  onScan: (text: string) => void
  /** Ignore the same value re-read within this window (ms). */
  dedupeMs?: number
}

const hints = new Map<DecodeHintType, unknown>()
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
])
hints.set(DecodeHintType.TRY_HARDER, true)

/**
 * Rear-camera barcode scanner. Metrc tags carry a 1D Code 128 barcode of the
 * 24-character label; QR/DataMatrix are included for future label formats.
 */
export function Scanner({ onScan, dedupeMs = 2500 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const onScanRef = useRef(onScan)
  const [error, setError] = useState<string | null>(null)
  const [torch, setTorch] = useState<boolean | null>(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 400 })

    reader
      .decodeFromVideoDevice(undefined, video, (result) => {
        if (!result) return
        const text = result.getText()
        const now = Date.now()
        const last = lastRef.current
        if (text === last.text && now - last.at < dedupeMs) return
        lastRef.current = { text, at: now }
        navigator.vibrate?.(60)
        setFlash(true)
        setTimeout(() => setFlash(false), 180)
        onScanRef.current(text)
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setTorch(controls.switchTorch ? false : null)
      })
      .catch((err: unknown) => {
        const name = (err as Error)?.name
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access in your browser settings, or type the tag below.'
            : name === 'NotFoundError'
              ? 'No camera found on this device. Type or paste the tag below.'
              : 'Could not start the camera. Type or paste the tag below.',
        )
      })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [dedupeMs])

  const toggleTorch = async () => {
    const c = controlsRef.current
    if (!c?.switchTorch || torch === null) return
    try {
      await c.switchTorch(!torch)
      setTorch(!torch)
    } catch {
      setTorch(null)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black aspect-[4/3]">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
      {!error && (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={`h-[34%] w-[86%] rounded-xl border-2 transition-colors ${flash ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/80'}`}
            />
          </div>
          <p className="pointer-events-none absolute bottom-2 inset-x-0 text-center text-xs text-white/90">
            Line up the barcode inside the box
          </p>
        </>
      )}
      {torch !== null && (
        <button
          type="button"
          onClick={toggleTorch}
          aria-label="Toggle flashlight"
          className="absolute top-2 right-2 h-10 w-10 inline-flex items-center justify-center rounded-full bg-black/50 text-white"
        >
          {torch ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
        </button>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white bg-gray-900/90">
          {error}
        </div>
      )}
    </div>
  )
}
