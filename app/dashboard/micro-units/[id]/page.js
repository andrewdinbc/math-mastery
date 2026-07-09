'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function MicroUnitDetailPage() {
  const { id } = useParams();
  const supabase = createClientComponentClient();
  const [unit, setUnit] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [mode, setMode] = useState('online');
  const [language, setLanguage] = useState('english');
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [students, setStudents] = useState([]);
  const [showAllVersions, setShowAllVersions] = useState({}); // studentId -> bool
  const [hoveredVersion, setHoveredVersion] = useState(null); // {studentId, versionNumber} | null
  const [questionsPerPage, setQuestionsPerPage] = useState(10);
  const [nameFile, setNameFile] = useState(null);
  const [studentNames, setStudentNames] = useState(null); // {studentId: name} - loaded locally, sent once, never stored

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.from('micro_units').select('*').eq('id', id).single();
      const { data: a } = await supabase.from('attempts').select('*, students(qr_code)').eq('micro_unit_id', id).order('created_at', { ascending: false });
      const { data: s } = u ? await supabase.from('students').select('*').eq('teacher_id', u.teacher_id) : { data: [] };
      setUnit(u);
      setAttempts(a || []);
      setStudents(s || []);
      setLoading(false);
    })();
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch('/api/generate-worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ microUnitId: id, mode, shuffleOrder, questionsPerPage, studentNames, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGenResult(data);
    } catch (err) {
      setGenResult({ error: err.message });
    }
    setGenerating(false);
  }

  // Example-values preview - fills placeholders with a representative
  // mid-range value so the teacher can see the actual format, like the
  // CommonCoreSheets preview pane.
  function resolveExample(prompt, ranges) {
    let out = prompt;
    if (ranges) {
      for (const [key, range] of Object.entries(ranges)) {
        const mid = Math.round((range.min + range.max) / 2);
        out = out.replaceAll(`{${key}}`, mid);
      }
    }
    return out;
  }

  if (loading) return <main style={{ padding: 32 }}>Loading…</main>;
  if (!unit) return <main style={{ padding: 32 }}>Unit not found.</main>;

  const questions = unit.question_template?.questions || [];
  const ranges = unit.question_template?.randomizable_ranges;

  return (
    <main style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <h1>{unit.title}</h1>
      <p style={{ color: '#666' }}>Grade {unit.grade} • {unit.strand} • {unit.question_count} questions • {unit.default_mastery_pct}% mastery{unit.randomizable && ' • Randomizable'}</p>

      <h2>Example Worksheet</h2>
      <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 10, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #222', paddingBottom: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{unit.title}</div>
          <div style={{ fontSize: 13 }}>Name: ___________________</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', fontSize: 14 }}>
          {questions.map((q, i) => (
            <div key={i}>
              <strong>{i + 1})</strong> {resolveExample(q.prompt, ranges)}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 16, borderTop: '1px solid #eee', paddingTop: 8 }}>
          Example values shown{unit.randomizable ? ' — each student\'s copy uses different random numbers, same structure.' : '.'}
        </div>
      </div>

      <h2>Generate Worksheets</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: 8 }}>
            <option value="online">Online, link only</option>
            <option value="printed">Printed (Name prefilled and QR)</option>
            <option value="blank">Blank (QR prefilled, student writes name)</option>
          </select>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: 8 }}>
            <option value="english">English</option>
            <option value="french">Français</option>
            <option value="spanish">Español</option>
          </select>
          <button onClick={handleGenerate} disabled={generating} style={{ padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6 }}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {mode !== 'online' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>Random question order</span>
            <span
              onClick={() => setShuffleOrder((v) => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, background: shuffleOrder ? '#1a7a3e' : '#ccc',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s', display: 'inline-block',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: shuffleOrder ? 18 : 2, width: 16, height: 16,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </span>
          </label>
        )}
        {mode !== 'online' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>Questions per page</span>
            <input
              type="number"
              min={10}
              value={questionsPerPage}
              onChange={(e) => setQuestionsPerPage(Math.max(10, Number(e.target.value) || 10))}
              style={{ width: 60, padding: 4, border: '1px solid #ddd4c2', borderRadius: 4 }}
            />
            <span style={{ color: '#888' }}>(minimum 10)</span>
          </label>
        )}
        {mode === 'printed' && (
          <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 8, padding: 10, fontSize: 12 }}>
            <div style={{ marginBottom: 4 }}>
              Names aren't stored in the cloud — optionally load your local roster file to print real names on this batch only (nothing is saved).
            </div>
            <input
              type="file"
              accept=".csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setNameFile(file);
                const text = await file.text();
                const lines = text.trim().split('\n').slice(1);
                const byQr = {};
                lines.forEach((line) => {
                  const [qrCode, firstName] = line.split(',');
                  if (qrCode && firstName) byQr[qrCode.trim()] = firstName.trim();
                });
                const map = {};
                students.forEach((s) => {
                  if (byQr[s.qr_code]) map[s.id] = byQr[s.qr_code];
                });
                setStudentNames(map);
              }}
            />
            {studentNames && <div style={{ color: '#1a7a3e', marginTop: 4 }}>✓ {Object.keys(studentNames).length} name(s) matched — will print on this batch only.</div>}
          </div>
        )}
        {mode !== 'online' && (
          <div style={{ fontSize: 12, color: '#888' }}>Generates {10} different versions per student.</div>
        )}
      </div>

      {genResult?.error && <div style={{ color: '#c00' }}>{genResult.error}</div>}
      {genResult?.exemplarNote && <div style={{ color: '#b57c2a', background: '#fff8ee', border: '1px solid #ddd4c2', borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 13 }}>ℹ️ {genResult.exemplarNote}</div>}

      {genResult?.links && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {genResult.links.map((l) => (
            <div key={l.studentId} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12 }}>
              {l.qrPngBase64 && (
                <img src={`data:image/png;base64,${l.qrPngBase64}`} alt="QR code" style={{ width: 70, height: 70 }} />
              )}
              <div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Scan with a personal device, or:</div>
                <a href={l.url} target="_blank" rel="noreferrer">{l.studentId === 'exemplar' ? 'Example link' : 'Open practice link'}</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {genResult?.worksheets && (
        <div>
          <div style={{ color: '#1a7a3e', marginBottom: 8 }}>
            ✓ Generated {genResult.worksheets.length} student(s) × {genResult.versionsPerStudent} version(s) each:
          </div>
          {genResult.worksheets.map((w) => {
            const matched = students.find((s) => s.id === w.studentId);
            const label = w.studentId === 'exemplar' ? 'Example Student (exemplar)' : matched?.qr_code || w.studentId;
            const expanded = showAllVersions[w.studentId];
            const versionsToShow = expanded ? w.versions : w.versions.slice(0, 1);
            return (
              <div key={w.studentId} style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <strong>{label}</strong>
                <ul style={{ marginTop: 6 }}>
                  {versionsToShow.map((v) => {
                    const dataUrl = `data:application/pdf;base64,${v.pdfBase64}`;
                    const isHovered = hoveredVersion?.studentId === w.studentId && hoveredVersion?.versionNumber === v.versionNumber;
                    return (
                      <li key={v.versionNumber} style={{ marginBottom: 2, position: 'relative' }}
                        onMouseEnter={() => setHoveredVersion({ studentId: w.studentId, versionNumber: v.versionNumber })}
                        onMouseLeave={() => setHoveredVersion(null)}
                      >
                        <a href={dataUrl} download={`${unit.title}-${label}-v${v.versionNumber}.pdf`}>
                          📄 Version {v.versionNumber} — Download PDF
                        </a>
                        {isHovered && v.questions && (
                          <div style={{
                            position: 'absolute', left: '100%', top: 0, marginLeft: 10, zIndex: 10,
                            background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', width: 280, fontSize: 12,
                          }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Actual questions in this version:</div>
                            {v.questions.map((q, i) => <div key={i} style={{ marginBottom: 3 }}>{i + 1}) {q.prompt}</div>)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {w.versions.length > 1 && (
                  <button
                    onClick={() => setShowAllVersions((prev) => ({ ...prev, [w.studentId]: !prev[w.studentId] }))}
                    style={{ background: 'none', border: 'none', color: '#1c3557', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                  >
                    {expanded ? 'Show fewer' : `Show all ${w.versions.length} versions`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2>Attempts</h2>
      {attempts.length === 0 ? (
        <p style={{ color: '#888', fontStyle: 'italic' }}>No attempts yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: 8 }}>Student</th><th style={{ padding: 8 }}>Score</th><th style={{ padding: 8 }}>Passed</th>
          </tr></thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{a.students?.qr_code || '—'}</td>
                <td style={{ padding: 8 }}>{a.score_pct != null ? `${a.score_pct}%` : '—'}</td>
                <td style={{ padding: 8 }}>{a.passed_threshold === null ? '—' : a.passed_threshold ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}



