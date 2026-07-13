'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import ProgressChart from '@/components/ProgressChart'

const C = { navy: '#1c3557', gold: '#b57c2a', green: '#2e7d4f', red: '#c0392b', border: '#ddd4c2' }

// Locked-session pattern reused from the Quiz Maker work - can't actually
// prevent a student leaving the tab/app from a webpage, only detect it,
// make it loud, and tell the teacher. Fullscreen + visibilitychange/blur
// detection, same as the quiz sessions.
function playAlertBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3)
    osc.stop(ctx.currentTime + 0.5)
  } catch { /* alert still logs to the teacher either way */ }
}

export default function PracticeHomePage() {
  const { qrCode } = useParams()
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [openRemediation, setOpenRemediation] = useState(null)
  const hasEnteredFullscreen = useRef(false)

  useEffect(() => {
    fetch(`/api/practice-home/${encodeURIComponent(qrCode)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('Could not load your practice info.'))
  }, [qrCode])

  useEffect(() => {
    if (document.documentElement.requestFullscreen && !hasEnteredFullscreen.current) {
      document.documentElement.requestFullscreen().catch(() => {})
      hasEnteredFullscreen.current = true
    }
    function reportOffTask(reason) {
      playAlertBeep()
      fetch('/api/off-task-alert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode, reason }),
      }).catch(() => {})
    }
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') reportOffTask('tab_hidden') }
    const onBlur = () => reportOffTask('window_blur')
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
    }
  }, [qrCode])

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
      <div style={{ color: C.red }}>{error}</div>
    </div>
  )
  if (!data) return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ color: C.navy, fontSize: 22, marginBottom: 4 }}>Your Practice</h1>
        <p style={{ fontSize: 13, color: '#8a7d6e', marginBottom: 24 }}>{data.unitsCompleted} of {data.totalUnits} units mastered</p>

        {!data.currentUnit ? (
          <div style={{ background: '#eef7f0', borderRadius: 10, padding: 24, textAlign: 'center', color: C.green, fontWeight: 700 }}>
            🎉 You&apos;ve mastered every assigned unit! Ask your teacher what&apos;s next.
          </div>
        ) : (
          <>
            <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Current Unit</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.navy, marginBottom: 4 }}>{data.currentUnit.title}</div>
              <div style={{ fontSize: 13, color: '#5c5245', marginBottom: 12 }}>{data.currentUnit.description}</div>
              <div style={{ fontSize: 12, color: '#8a7d6e' }}>Step {data.currentStep} {data.attemptCount > 0 && `(attempt ${data.attemptCount + 1})`}</div>
            </div>

            {(data.currentUnit.video_url || data.currentUnit.khan_academy_video_url) && (
              <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Review Videos</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {data.currentUnit.video_url && (
                    <a href={data.currentUnit.video_url} target="_blank" rel="noreferrer" style={{
                      flex: 1, minWidth: 140, textAlign: 'center', padding: 10, background: '#f7f4ee', borderRadius: 8, textDecoration: 'none', color: C.navy, fontSize: 13, fontWeight: 600,
                    }}>
                      🎬 Math Antics
                    </a>
                  )}
                  {data.currentUnit.khan_academy_video_url && (
                    <a href={data.currentUnit.khan_academy_video_url} target="_blank" rel="noreferrer" style={{
                      flex: 1, minWidth: 140, textAlign: 'center', padding: 10, background: '#f7f4ee', borderRadius: 8, textDecoration: 'none', color: C.navy, fontSize: 13, fontWeight: 600,
                    }}>
                      🎬 Khan Academy
                    </a>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => router.push(`/practice/${data.currentUnit.id}?student=${data.studentId}`)}
              style={{ width: '100%', padding: 16, background: C.gold, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: 'pointer', marginBottom: 24 }}
            >
              ▶ Practice Questions
            </button>

            {data.remediation?.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10 }}>📝 Help With Mistakes You Made</div>
                {data.remediation.map((r) => {
                  const tutorial = r.remediation_content?.videoTutorial
                  const isOpen = openRemediation === r.id
                  return (
                    <div key={r.id} style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: 16, marginBottom: 10 }}>
                      <button
                        onClick={() => setOpenRemediation(isOpen ? null : r.id)}
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <div style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{tutorial?.title || r.error_pattern?.replace(/_/g, ' ') || 'Review this mistake'}</div>
                        <div style={{ fontSize: 11, color: '#8a7d6e' }}>{isOpen ? 'Tap to close' : 'Tap to read the tutorial'}</div>
                      </button>
                      {isOpen && tutorial && (
                        <div style={{ marginTop: 12, fontSize: 13, color: '#3a352c' }}>
                          <p style={{ fontStyle: 'italic', marginBottom: 10 }}>{tutorial.hook}</p>
                          {tutorial.steps?.map((s, i) => (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div>{s.narration}</div>
                              {s.workShown && <div style={{ fontFamily: 'monospace', background: '#f7f4ee', padding: '4px 8px', borderRadius: 4, marginTop: 4 }}>{s.workShown}</div>}
                            </div>
                          ))}
                          {tutorial.commonMistakeCallout && (
                            <div style={{ background: '#fdecea', padding: 10, borderRadius: 6, marginTop: 10, fontSize: 12 }}>{tutorial.commonMistakeCallout}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: 20, marginTop: 24 }}>
          <ProgressChart qrCode={qrCode} viewer="student" />
        </div>
      </div>
    </div>
  )
}


