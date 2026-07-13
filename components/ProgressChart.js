'use client'
import { useState, useEffect } from 'react'

const C = { navy: '#1c3557', gold: '#b57c2a', green: '#2e7d4f', muted: '#8a7d6e', border: '#ddd4c2' }

export default function ProgressChart({ qrCode, viewer }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/progress/${encodeURIComponent(qrCode)}?viewer=${viewer}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('Could not load progress.'))
  }, [qrCode, viewer])

  if (error) return <div style={{ color: '#c0392b', fontSize: 13 }}>{error}</div>
  if (!data) return <div style={{ color: C.muted, fontSize: 13 }}>Loading progress…</div>

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 14 }}>📊 My Progress Chart</div>
      {data.strands.map((s, si) => (
        <div key={s.strand} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.gold, marginBottom: 8 }}>{si + 1}. {s.strand}</div>
          {s.units.map((u, ui) => (
            <div key={u.unitId} style={{ marginLeft: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{si + 1}.{ui + 1} {u.title}</span>
                {u.mastered && <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓ Mastered</span>}
              </div>

              {u.baseline && (
                <div style={{ fontSize: 11, color: C.muted, marginLeft: 8, marginBottom: 4, fontStyle: 'italic' }}>
                  Baseline (start of year): {u.baseline.scoreDisplay || '—'} on {new Date(u.baseline.date).toLocaleDateString()}
                </div>
              )}

              {u.tasks.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>Not started yet</div>
              ) : (
                u.tasks.map((t) => (
                  <div key={t.taskNumber} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginLeft: 8, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.navy }}>{si + 1}.{ui + 1}.{t.taskNumber} Task {t.taskNumber}</span>
                    <span style={{ color: t.passed ? C.green : C.muted, fontWeight: 600 }}>
                      {t.scoreDisplay || t.feedback}
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
