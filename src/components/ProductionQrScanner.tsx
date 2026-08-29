import { Camera, LoaderCircle, QrCode, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProductionRouteFromQrData } from '../domain/productionQr'

function cameraErrorMessage(reason: unknown) {
  if (!window.isSecureContext) return 'Camera scanning requires a secure HTTPS connection.'
  if (reason instanceof DOMException && reason.name === 'NotAllowedError') return 'Camera access was denied. Allow camera access in your browser settings and try again.'
  if (reason instanceof DOMException && reason.name === 'NotFoundError') return 'No camera was found on this device.'
  return 'The camera could not be started. Check browser camera permissions and try again.'
}

export function ProductionQrScanner({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const handled = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let scanner: import('qr-scanner').default | null = null

    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('Camera scanning requires a supported browser and a secure HTTPS connection.')
        return
      }

      try {
        const { default: QrScanner } = await import('qr-scanner')
        if (!active || !videoRef.current) return
        scanner = new QrScanner(videoRef.current, (result) => {
          if (handled.current) return
          try {
            const route = getProductionRouteFromQrData(result.data, window.location.origin)
            handled.current = true
            scanner?.stop()
            onClose()
            navigate(route)
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Scan a ShopCore traveler QR code.')
          }
        }, {
          preferredCamera: 'environment',
          maxScansPerSecond: 10,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        })
        await scanner.start()
        if (active) setReady(true)
      } catch (reason) {
        if (active) setError(cameraErrorMessage(reason))
      }
    }

    void start()
    return () => {
      active = false
      scanner?.destroy()
    }
  }, [navigate, onClose])

  return <div className="qr-scanner-backdrop" role="presentation">
    <section className="qr-scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-scanner-title">
      <header><div><QrCode size={19} /><h2 id="qr-scanner-title">Scan traveler QR</h2></div><button type="button" onClick={onClose} aria-label="Close QR scanner"><X size={22} /></button></header>
      <div className="qr-camera-frame">
        <video ref={videoRef} muted playsInline aria-label="Camera preview" />
        {!ready && !error && <div className="qr-camera-status"><LoaderCircle className="spin" /><span>Starting camera…</span></div>}
      </div>
      <div className="qr-scanner-copy"><Camera size={18} /><p>Point the rear camera at a routing-step QR code on a ShopCore traveler.</p></div>
      {error && <p className="qr-scanner-error" role="alert">{error}</p>}
    </section>
  </div>
}
