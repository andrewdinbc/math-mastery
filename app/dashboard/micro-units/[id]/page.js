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

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.from('micro_units').select('*').eq('id', id).single();
      const { data: a } = await supabase.from('attempts').select('*, students(display_name)').eq('micro_unit_id', id).order('created_at', { ascending: false });
      setUnit(u);
      setAttempts(a || []);
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
        body: JSON.stringify({ microUnitId: id, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGenResult(data);
    } catch (err) {
      setGenResult({ error: err.message });
    }
    setGenerating(false);
  }

  if (loading) return <main style={{ padding: 32 }}>Loading…</main>;
  if (!unit) return <main style={{ padding: 32 }}>Unit not found.</main>;

  return (
    <main style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <h1>{unit.title}</h1>
      <p style={{ color: '#666' }}>Grade {unit.grade} • {unit.strand} • {unit.question_count} questions • {unit.default_mastery_pct}% mastery{unit.randomizable && ' • Randomizable'}</p>

      <h2>Generate Worksheets</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: 8 }}>
          <option value="online">Online (links only)</option>
          <option value="printed">Printed (name pre-filled + QR)</option>
          <option value="blank">Blank (student writes name + QR)</option>
        </select>
        <button onClick={handleGenerate} disabled={generating} style={{ padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6 }}>
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {genResult?.error && <div style={{ color: '#c00' }}>{genResult.error}</div>}
      {genResult?.links && (
        <ul>
          {genResult.links.map((l) => <li key={l.studentId}><a href={l.url} target="_blank" rel="noreferrer">{l.displayName || l.studentId}</a></li>)}
        </ul>
      )}
      {genResult?.worksheets && <div style={{ color: '#1a7a3e' }}>✓ Generated {genResult.worksheets.length} worksheet PDF(s).</div>}

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
                <td style={{ padding: 8 }}>{a.students?.display_name || '—'}</td>
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
