'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const C = { navy: '#1c3557', gold: '#b57c2a', border: '#ddd4c2', green: '#2e7d4f', red: '#c0392b' }

// Adaptive difficulty, deliberately simple rather than a full statistical
// model - a rolling window of the last 5 answers: all correct AND under
// 3s average -> expand the fact range by 1 (both ends move together, e.g.
// 1-6 becomes 1-7); 2+ wrong in the window -> contract by 1, floor of
// 1-5 so it never gets trivially easy. This runs entirely client-side so
// there's zero latency between an answer and the next problem's
// difficulty - no round trip needed mid-session.
const WINDOW_SIZE = 5
const MIN_RANGE_WIDTH = 4

function nextProblem(factMin, factMax) {
  const a = Math.floor(Math.random() * (factMax - factMin + 1)) + factMin
  const b = Math.floor(Math.random() * (factMax - factMin + 1)) + factMin
  return { a, b, answer: a * b }
}

export default function LiveDrillFlow({ studentId, initialFactMin = 1, initialFactMax = 6 }) {
  const [stage, setStage] = useState('intro') // intro | playing | done
  const [factMin, setFactMin] = useState(initialFactMin)
  const [factMax, setFactMax] = useState(initialFactMax)
  const [problem, setProblem] = useState(null)
  const [input, setInput] = useState('')
  const [flash, setFlash] = useState(null) // 'correct' | 'wrong' | null
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [milestone, setMilestone] = useState(null)
  const [history, setHistory] = useState([]) // {a, b, answer, studentAnswer, correct, timeMs, factMin, factMax}
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [commentary, setCommentary] = useState(null)
  const problemStartRef = useRef(null)
  const timerRef = useRef(null)
  const inputRef = useRef(null)

  const startProblem = useCallback((min, max) => {
    setProblem(nextProblem(min, max))
    setInput('')
    problemStartRef.current = Date.now()
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  function start() {
    setStage('playing')
    setHistory([])
    setStreak(0)
    setSecondsElapsed(0)
    startProblem(factMin, factMax)
    timerRef.current = setInterval(() => setSecondsElapsed((s) => s + 1), 1000)
  }

  function adjustDifficulty(recentHistory) {
    const window = recentHistory.slice(-WINDOW_SIZE)
    if (window.length < WINDOW_SIZE) return
    const allCorrect = window.every((h) => h.correct)
    const avgTime = window.reduce((sum, h) => sum + h.timeMs, 0) / window.length
    const wrongCount = window.filter((h) => !h.correct).length

    if (allCorrect && avgTime < 3000) {
      setFactMax((m) => Math.min(m + 1, 12))
      setFactMin((m) => Math.min(m + 1, 12 - MIN_RANGE_WIDTH))
    } else if (wrongCount >= 2) {
      setFactMax((m) => Math.max(m - 1, MIN_RANGE_WIDTH))
      setFactMin((m) => Math.max(m - 1, 1))
    }
  }

  function submitAnswer() {
    if (!input.trim() || !problem) return
    const timeMs = Date.now() - problemStartRef.current
    const studentAnswer = parseInt(input, 10)
    const correct = studentAnswer === problem.answer

    setFlash(correct ? 'correct' : 'wrong')

    const entry = { ...problem, studentAnswer, correct, timeMs, factMin, factMax }
    const newHistory = [...history, entry]
    setHistory(newHistory)

    if (correct) {
      const newStreak = streak + 1
      setStreak(newStreak)
      if (newStreak > bestStreak) setBestStreak(newStreak)
      if ([5, 10, 20].includes(newStreak)) {
        setMilestone(newStreak)
        setTimeout(() => setMilestone(null), 1200)
      }
    } else {
      setStreak(0)
    }

    adjustDifficulty(newHistory)

    setTimeout(() => {
      setFlash(null)
      if (newHistory.length >= 30) {
        finish(newHistory)
      } else {
        startProblem(factMin, factMax)
      }
    }, 550)
  }

  async function finish(finalHistory) {
    clearInterval(timerRef.current)
    setStage('done')
    setSaving(true)
    try {
      // Save happens server-side (service role) rather than a client-side
      // insert against mastery_attempts - that table has RLS enabled with
      // only a SELECT policy defined, no INSERT policy, so an anonymous
      // student session (no Supabase Auth login, by design) would likely
      // have the write silently denied. Matches the more robust pattern
      // already used elsewhere for student-facing writes (see
      // app/practice/[microUnitId]/page.js's service-role admin client).
      const res = await fetch('/api/live-drill/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, history: finalHistory, secondsElapsed, bestStreak }),
      })
      const data = await res.json()
      setCommentary(data.commentary || { headline: 'Nice work!', detail: 'Keep practicing to build speed and accuracy.' })
    } catch {
      setCommentary({ headline: 'Nice work!', detail: 'Keep practicing to build speed and accuracy.' })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  if (stage === 'intro') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', background: '#faf7f2' }}>
      <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
        <h1 style={{ color: C.navy, fontSize: 24, marginBottom: 8 }}>Multiplication Drill</h1>
        <p style={{ color: '#8a7d6e', fontSize: 14, marginBottom: 24 }}>
          Answer as many as you can. It gets harder the better you do — and eases up if you need it to.
        </p>
        <button onClick={start} style={{ padding: '14px 32px', background: C.gold, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>
          Start
        </button>
      </div>
    </div>
  )

  if (stage === 'playing') return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif', background: flash === 'correct' ? '#e8f5ec' : flash === 'wrong' ? '#fdeceb' : '#faf7f2',
      transition: 'background 0.15s',
    }}>
      <div style={{ position: 'absolute', top: 20, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.navy }}>
        <span>🔥 Streak: {streak} {bestStreak > streak && `(best ${bestStreak})`}</span>
        <span>⏱ {Math.floor(secondsElapsed / 60)}:{String(secondsElapsed % 60).padStart(2, '0')}</span>
        <span>#{history.length + 1} / 30</span>
      </div>

      {milestone && (
        <div style={{ position: 'absolute', top: 100, fontSize: 20, fontWeight: 700, color: C.gold }}>
          🔥 {milestone} in a row!
        </div>
      )}

      {problem && (
        <>
          <div style={{ fontSize: 56, fontWeight: 700, color: C.navy, marginBottom: 24 }}>
            {problem.a} × {problem.b} = ?
          </div>
          <input
            ref={inputRef}
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAnswer() }}
            style={{
              fontSize: 32, padding: '12px 20px', width: 160, textAlign: 'center', border: `2px solid ${C.border}`, borderRadius: 10,
              fontFamily: 'inherit',
            }}
          />
        </>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', background: C.navy, color: '#fff', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>
          {history.filter((h) => h.correct).length} / {history.length} correct
        </h1>
        <p style={{ opacity: 0.8, marginBottom: 4 }}>Best streak: {bestStreak}</p>
        <p style={{ opacity: 0.8, marginBottom: 20 }}>{Math.floor(secondsElapsed / 60)}m {secondsElapsed % 60}s</p>
        {saving && <p style={{ opacity: 0.6, fontSize: 13 }}>Saving…</p>}
        {commentary && (
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 18, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{commentary.headline}</div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>{commentary.detail}</div>
          </div>
        )}
      </div>
    </div>
  )
}
