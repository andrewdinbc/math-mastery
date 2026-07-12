'use client'
import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'

const C = { navy: '#1c3557', gold: '#b57c2a', border: '#ddd4c2', green: '#2e7d4f', red: '#c0392b' }

export default function DrillSubmitPage() {
  const { drillId, qrCode } = useParams()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  function handleFile(f) {
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function submit() {
    if (!file) return
    setSubmitting(true); setError('')
    try {
      const formData = new FormData()
      formData.append('photo', file)
      formData.append('drillId', drillId)
      formData.append('qrCode', qrCode)
      const res = await fetch('/api/multiplication-drills/submit', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (result) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', background: C.navy, color: '#fff', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{result.scorePct >= 80 ? '🎉' : '📝'}</div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>{result.correct} / {result.total} correct</h1>
        <p style={{ opacity: 0.85, fontSize: 15 }}>{result.scorePct}%</p>
        <p style={{ opacity: 0.7, fontSize: 13, marginTop: 16 }}>Your teacher can see this now. Nice work!</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', background: '#faf7f2', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <h1 style={{ color: C.navy, fontSize: 22, marginBottom: 8 }}>Submit Your Drill</h1>
        <p style={{ color: '#8a7d6e', fontSize: 14, marginBottom: 24 }}>
          Take a clear photo of your completed worksheet, or upload one.
        </p>

        {preview ? (
          <img src={preview} alt="Preview" style={{ width: '100%', borderRadius: 8, marginBottom: 16, border: `1px solid ${C.border}` }} />
        ) : (
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${C.border}`, borderRadius: 10, padding: 40, cursor: 'pointer', marginBottom: 16, background: '#fff',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
            <div style={{ color: C.navy, fontSize: 14 }}>Tap to take a photo or choose a file</div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFile(e.target.files[0])}
          style={{ display: 'none' }}
        />

        {preview && (
          <button onClick={() => inputRef.current?.click()} style={{
            padding: '8px 16px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.navy, cursor: 'pointer', marginBottom: 16,
          }}>
            Retake Photo
          </button>
        )}

        <button
          onClick={submit}
          disabled={!file || submitting}
          style={{ width: '100%', padding: 14, background: C.gold, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}
        >
          {submitting ? 'Checking your work…' : 'Submit'}
        </button>
        {error && <div style={{ marginTop: 12, color: C.red, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  )
}
