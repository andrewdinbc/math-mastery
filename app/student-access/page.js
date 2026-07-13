'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const C = { navy: '#1c3557', gold: '#b57c2a', border: '#ddd4c2', red: '#c0392b' }

// Replaces email/password for STUDENTS specifically - per Aj, students
// should never have a real login. This is a scan-or-code entry point,
// same access-token-not-account pattern already used across the rest of
// the suite (Oral Reading, Quiz Maker, Multiplication Drills). Teachers
// keep the real Supabase Auth login at /auth/login - this page is a
// completely separate path for students only.
export default function StudentAccessPage() {
  const router = useRouter()
  const [mode, setMode] = useState('code') // 'code' | 'scan'
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  function goToCode(qrCode) {
    if (!qrCode.trim()) return
    router.push(`/practice-home/${encodeURIComponent(qrCode.trim())}`)
  }

  async function startScan() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setScanning(true)
      scanLoop()
    } catch (e) {
      setError('Could not access the camera. Ask your teacher for help, or use your code instead.')
      setMode('code')
    }
  }

  function stopScan() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setScanning(false)
  }

  async function scanLoop() {
    if (!('BarcodeDetector' in window)) {
      setError('QR scanning isn\'t supported on this device/browser — use your code instead.')
      setMode('code')
      stopScan()
      return
    }
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    const tick = async () => {
      if (!streamRef.current || !videoRef.current) return
      try {
        const codes = await detector.detect(videoRef.current)
        if (codes.length > 0) {
          stopScan()
          goToCode(codes[0].rawValue)
          return
        }
      } catch { /* keep trying */ }
      if (streamRef.current) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  useEffect(() => () => stopScan(), [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#f7f4ee', padding: 24 }}>
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧮</div>
        <h1 style={{ color: C.navy, fontSize: 22, marginBottom: 20 }}>Math Mastery</h1>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => { setMode('code'); stopScan() }}
            style={{
              flex: 1, padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: mode === 'code' ? C.navy : '#fff', color: mode === 'code' ? '#fff' : C.navy, border: `1px solid ${C.border}`,
            }}
          >
            ⌨️ Enter Code
          </button>
          <button
            onClick={() => { setMode('scan'); startScan() }}
            style={{
              flex: 1, padding: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: mode === 'scan' ? C.navy : '#fff', color: mode === 'scan' ? '#fff' : C.navy, border: `1px solid ${C.border}`,
            }}
          >
            📷 Scan QR Code
          </button>
        </div>

        {mode === 'code' && (
          <div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') goToCode(code) }}
              placeholder="Your code"
              style={{ width: '100%', padding: 14, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 18, textAlign: 'center', marginBottom: 14, boxSizing: 'border-box' }}
            />
            <button
              onClick={() => goToCode(code)}
              disabled={!code.trim()}
              style={{ width: '100%', padding: 14, background: C.gold, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}
            >
              Go
            </button>
          </div>
        )}

        {mode === 'scan' && (
          <div>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8, marginBottom: 10, background: '#000' }} />
            <p style={{ fontSize: 12, color: '#8a7d6e' }}>Point the camera at your QR code.</p>
          </div>
        )}

        {error && <div style={{ marginTop: 14, color: C.red, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  )
}
