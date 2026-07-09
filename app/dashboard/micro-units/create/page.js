'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function CreateMicroUnitPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [aiTopic, setAiTopic] = useState('');
  const [aiGrade, setAiGrade] = useState('');
  const [researching, setResearching] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestError, setSuggestError] = useState('');
  const [addingIndex, setAddingIndex] = useState(null);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [strand, setStrand] = useState('');
  const [masteryPct, setMasteryPct] = useState(80);
  const [randomizable, setRandomizable] = useState(true);
  const [questionsText, setQuestionsText] = useState('[\n  { "prompt": "{a} + {b} = ?", "answer_formula": "a+b" }\n]');
  const [rangesText, setRangesText] = useState('{\n  "a": { "min": 1, "max": 20 },\n  "b": { "min": 1, "max": 20 }\n}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleResearch(e) {
    e.preventDefault();
    setResearching(true);
    setSuggestError('');
    setSuggestions(null);
    try {
      const res = await fetch('/api/suggest-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: aiTopic, grade: aiGrade }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Research failed');
      setSuggestions(data.units);
    } catch (err) {
      setSuggestError(err.message || 'Failed to research units');
    }
    setResearching(false);
  }

  async function handleAddSuggestion(unit, index) {
    setAddingIndex(index);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { error: insertError } = await supabase.from('micro_units').insert({
        teacher_id: user.id,
        title: unit.title,
        grade: unit.grade,
        strand: unit.strand,
        question_template: unit.questionTemplate,
        randomizable: true,
        default_mastery_pct: 80,
        question_count: unit.questionTemplate?.questions?.length || 1,
      });
      if (insertError) throw insertError;
      setSuggestions((prev) => prev.map((u, i) => (i === index ? { ...u, added: true } : u)));
    } catch (err) {
      setSuggestError(err.message || 'Failed to add unit');
    }
    setAddingIndex(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const questions = JSON.parse(questionsText);
      const randomizable_ranges = randomizable ? JSON.parse(rangesText) : undefined;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { data, error: insertError } = await supabase
        .from('micro_units')
        .insert({
          teacher_id: user.id,
          title,
          grade,
          strand,
          question_template: { questions, randomizable_ranges },
          randomizable,
          default_mastery_pct: Number(masteryPct),
          question_count: questions.length,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      router.push(`/dashboard/micro-units/${data.id}`);
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
    setSaving(false);
  }

  return (
    <main style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <h1>Create Unit</h1>

      <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>🔍 AI Unit Breakdown</h2>
        <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
          Give a topic and grade - AI researches CommonCoreSheets.com's actual skill sequencing and suggests a logical progression of Units, from foundational to advanced.
        </p>
        <form onSubmit={handleResearch} style={{ display: 'flex', gap: 8 }}>
          <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g. Using Substitutions to Solve Problems" required style={{ ...inputStyle, marginTop: 0, flex: 2 }} />
          <input value={aiGrade} onChange={(e) => setAiGrade(e.target.value)} placeholder="Grade" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
          <button type="submit" disabled={researching} style={{ padding: '0 16px', background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {researching ? 'Researching…' : 'Research & Suggest'}
          </button>
        </form>
        {suggestError && <div style={{ color: '#c00', marginTop: 10, fontSize: 13 }}>{suggestError}</div>}
        {suggestions && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {suggestions.map((u, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <strong>{i + 1}. {u.title}</strong>
                  <div style={{ fontSize: 12, color: '#666' }}>{u.strand} • Grade {u.grade}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{u.description}</div>
                </div>
                <button
                  onClick={() => handleAddSuggestion(u, i)}
                  disabled={u.added || addingIndex === i}
                  style={{ padding: '6px 12px', background: u.added ? '#1a7a3e' : '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {u.added ? '✓ Added' : addingIndex === i ? 'Adding…' : '+ Add This Unit'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16 }}>Or build one manually</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} /></label>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>Grade<input value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle} /></label>
          <label style={{ flex: 1 }}>Strand<input value={strand} onChange={(e) => setStrand(e.target.value)} style={inputStyle} /></label>
          <label style={{ flex: 1 }}>Default Mastery %<input type="number" min="0" max="100" value={masteryPct} onChange={(e) => setMasteryPct(e.target.value)} style={inputStyle} /></label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={randomizable} onChange={(e) => setRandomizable(e.target.checked)} />
          Randomizable (each student gets different numbers, same structure)
        </label>
        <label>Questions (JSON array)<textarea value={questionsText} onChange={(e) => setQuestionsText(e.target.value)} rows={6} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} /></label>
        {randomizable && <label>Variable Ranges (JSON)<textarea value={rangesText} onChange={(e) => setRangesText(e.target.value)} rows={4} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} /></label>}
        <button type="submit" disabled={saving} style={{ padding: 10, background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700 }}>
          {saving ? 'Saving…' : 'Create Unit'}
        </button>
        {error && <div style={{ color: '#c00' }}>{error}</div>}
      </form>
    </main>
  );
}

const inputStyle = { width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' };
