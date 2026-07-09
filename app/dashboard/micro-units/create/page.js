'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function CreateMicroUnitPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [strand, setStrand] = useState('');
  const [masteryPct, setMasteryPct] = useState(80);
  const [randomizable, setRandomizable] = useState(true);
  const [questionsText, setQuestionsText] = useState('[\n  { "prompt": "{a} + {b} = ?", "answer_formula": "a+b" }\n]');
  const [rangesText, setRangesText] = useState('{\n  "a": { "min": 1, "max": 20 },\n  "b": { "min": 1, "max": 20 }\n}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
