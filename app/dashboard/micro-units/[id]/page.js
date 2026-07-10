'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function MicroUnitDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [unit, setUnit] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [mode, setMode] = useState('online');
  const [language, setLanguage] = useState('english');
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(false);
  const [students, setStudents] = useState([]);
  const [showAllVersions, setShowAllVersions] = useState({}); // studentId -> bool
  const [hoveredVersion, setHoveredVersion] = useState(null); // {studentId, versionNumber} | null
  const [questionsPerPage, setQuestionsPerPage] = useState(10);
  const [nameFile, setNameFile] = useState(null);
  const [studentNames, setStudentNames] = useState(null); // {studentId: name} - loaded locally, sent once, never stored
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [difficulty, setDifficulty] = useState(5);
  const [simplifyInstructions, setSimplifyInstructions] = useState(false);
  const [showWorkedExample, setShowWorkedExample] = useState(false);
  const [differentiatePerStudent, setDifferentiatePerStudent] = useState(false);

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
        body: JSON.stringify({ microUnitId: id, mode, shuffleOrder, questionsPerPage, studentNames, language, includeAnswerKey, difficulty, simplifyInstructions, showWorkedExample, differentiatePerStudent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGenResult(data);
    } catch (err) {
      setGenResult({ error: err.message });
    }
    setGenerating(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${unit.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const { error: delError } = await supabase.from('micro_units').delete().eq('id', id);
      if (delError) throw delError;
      router.push('/dashboard');
    } catch (err) {
      alert('Failed to delete: ' + err.message);
      setDeleting(false);
    }
  }

  async function handlePreview() {
    if (mode === 'online') return;
    setPreviewing(true);
    try {
      const res = await fetch('/api/generate-worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          microUnitId: id, mode, shuffleOrder, questionsPerPage, language, includeAnswerKey, previewOnly: true,
          difficulty, simplifyInstructions, showWorkedExample,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreviewUrl(`data:application/pdf;base64,${data.pdfBase64}`);
    } catch (err) {
      alert('Preview failed: ' + err.message);
    }
    setPreviewing(false);
  }

  // Live preview - always showing, not behind a button. Refreshes
  // automatically once the unit loads, and whenever mode/language change
  // (the settings that would obviously look different); other tweaks
  // (difficulty, instructions, etc.) apply via the Update Worksheet panel's
  // explicit button so it isn't re-generating on every slider tick.
  useEffect(() => {
    if (unit) handlePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, mode, language]);

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

  function toEmbedUrl(url) {
    if (!url) return '';
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
    return url; // fall back to whatever URL was found (e.g. a direct mathantics.com page)
  }

  return (
    <main style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 style={{ margin: 0 }}>{unit.sequence_order != null && `Unit ${unit.sequence_order + 1}: `}{unit.title}</h1>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{ padding: '6px 12px', background: '#fff', color: '#b03a2e', border: '1px solid #b03a2e', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
        >
          {deleting ? 'Deleting…' : '🗑 Delete Unit'}
        </button>
      </div>
      <p style={{ color: '#666' }}>Grade {unit.grade} • {unit.strand} • {unit.question_count} questions • {unit.default_mastery_pct}% mastery{unit.randomizable && ' • Randomizable'}</p>

      {unit.video_url && (
        <>
          <h2>📺 Math Antics Video</h2>
          <p style={{ fontSize: 12, color: '#888', marginTop: -8 }}>Project this to a TV for whole-class instruction before students practice.</p>
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, marginBottom: 24, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
            <iframe
              src={toEmbedUrl(unit.video_url)}
              title="Math Antics video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Worksheet Preview</h2>
        <button
          onClick={() => setShowUpdatePanel((v) => !v)}
          style={{ padding: '8px 16px', background: showUpdatePanel ? '#1c3557' : '#fff', color: showUpdatePanel ? '#fff' : '#1c3557', border: '1px solid #1c3557', borderRadius: 6, fontSize: 13, fontWeight: 700 }}
        >
          ⚙ Update Worksheet
        </button>
      </div>

      {showUpdatePanel && (
        <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>Amount of questions per page</span>
              <span style={{ fontWeight: 700 }}>{questionsPerPage}</span>
            </div>
            <input type="range" min={10} max={40} value={questionsPerPage} onChange={(e) => setQuestionsPerPage(Number(e.target.value))} style={{ width: '100%' }} />
          </label>

          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>Difficulty</span>
              <span style={{ fontWeight: 700 }}>{difficulty <= 3 ? 'Easier' : difficulty >= 8 ? 'Harder' : difficulty === 5 ? 'Original' : difficulty < 5 ? 'Slightly Easier' : 'Slightly Harder'} ({difficulty}/10)</span>
            </div>
            <input type="range" min={1} max={10} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} style={{ width: '100%' }} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <span>Simplify instructions</span>
            <span onClick={() => setSimplifyInstructions((v) => !v)} style={toggleTrack(simplifyInstructions)}>
              <span style={toggleThumb(simplifyInstructions)} />
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <span>Example question solved step by step</span>
            <span onClick={() => setShowWorkedExample((v) => !v)} style={toggleTrack(showWorkedExample)}>
              <span style={toggleThumb(showWorkedExample)} />
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
            <span>Differentiate difficulty per student (based on recent scores)</span>
            <span onClick={() => setDifferentiatePerStudent((v) => !v)} style={toggleTrack(differentiatePerStudent)}>
              <span style={toggleThumb(differentiatePerStudent)} />
            </span>
          </label>
          {differentiatePerStudent && (
            <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: -8 }}>
              Note: this only affects the real Generate step (per-student), not this shared preview.
            </div>
          )}

          <button onClick={handlePreview} disabled={previewing} style={{ padding: 10, background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700 }}>
            {previewing ? 'Updating…' : 'Apply & Update Preview'}
          </button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 10, padding: 12, marginBottom: 24, minHeight: 300 }}>
        {previewing && !previewUrl && <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading preview…</div>}
        {previewUrl && (
          <iframe src={previewUrl} style={{ width: '100%', height: 700, border: 'none' }} title="Worksheet preview" />
        )}
        {!previewUrl && !previewing && <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Preview unavailable for online mode.</div>}
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
          {genResult && (
            <button onClick={() => setGenResult(null)} style={{ padding: '8px 16px', background: '#fff', color: '#666', border: '1px solid #ddd4c2', borderRadius: 6 }}>
              Clear
            </button>
          )}
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
            <span>Include Answer Key</span>
            <span
              onClick={() => setIncludeAnswerKey((v) => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, background: includeAnswerKey ? '#1a7a3e' : '#ccc',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s', display: 'inline-block',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: includeAnswerKey ? 18 : 2, width: 16, height: 16,
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

      {previewUrl && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Preview — full page as it will print:</div>
          <iframe src={previewUrl} style={{ width: '100%', height: 700, border: '1px solid #ddd4c2', borderRadius: 8 }} title="Worksheet preview" />
        </div>
      )}

      {genResult?.error && <div style={{ color: '#c00' }}>{genResult.error}</div>}
      {genResult?.exemplarNote && <div style={{ color: '#b57c2a', background: '#fff8ee', border: '1px solid #ddd4c2', borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 13 }}>ℹ️ {genResult.exemplarNote}</div>}

      {mode === 'online' && (
        <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🖥️ One Shared Class Link</div>
          <p style={{ fontSize: 12, color: '#666', marginTop: 0, marginBottom: 10 }}>
            Open this on the classroom device (TV/computer) - the whole class uses this one link. Each student then scans their own QR code, or types their first name (after you load the roster file once on this device).
          </p>
          <button
            onClick={() => window.open(`/join/${id}`, '_blank')}
            style={{ padding: '10px 20px', background: '#1c3557', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
          >
            Open Class Link (full screen)
          </button>
        </div>
      )}

      {genResult?.links && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {genResult.links.map((l) => (
            <div key={l.studentId} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12 }}>
              {l.qrPngBase64 && (
                <img src={`data:image/png;base64,${l.qrPngBase64}`} alt="QR code" style={{ width: 70, height: 70 }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  onClick={() => window.open(`/qr-display?url=${encodeURIComponent(l.url)}&label=${encodeURIComponent(unit.title)}`, '_blank')}
                  style={{ padding: '4px 10px', background: '#1c3557', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', width: 'fit-content' }}
                >
                  🔲 Open Full-Screen QR (new tab)
                </button>
                <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{l.studentId === 'exemplar' ? 'Example link' : 'Open practice link'}</a>
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










const toggleTrack = (on) => ({
  width: 36, height: 20, borderRadius: 10, background: on ? '#1a7a3e' : '#ccc',
  position: 'relative', cursor: 'pointer', transition: 'background 0.2s', display: 'inline-block', flexShrink: 0,
});
const toggleThumb = (on) => ({
  position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16,
  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
});
