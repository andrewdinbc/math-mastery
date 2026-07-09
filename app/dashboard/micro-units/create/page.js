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
  const [expandedIndex, setExpandedIndex] = useState(null);

  const [resourceFile, setResourceFile] = useState(null);
  const [resourceUrl, setResourceUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [strand, setStrand] = useState('');
  const [masteryPct, setMasteryPct] = useState(80);
  const [randomizable, setRandomizable] = useState(true);
  const [questionsText, setQuestionsText] = useState('[\n  { "prompt": "{a} + {b} = ?", "answer_formula": "a+b" }\n]');
  const [rangesText, setRangesText] = useState('{\n  "a": { "min": 1, "max": 20 },\n  "b": { "min": 1, "max": 20 }\n}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleUploadResource(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResourceFile(file);
    setUploading(true);
    setUploadError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('unit-resources').upload(path, file);
      if (uploadErr) throw uploadErr;
      const { data: pub } = supabase.storage.from('unit-resources').getPublicUrl(path);
      setResourceUrl(pub.publicUrl);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    }
    setUploading(false);
  }

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
        resource_url: resourceUrl || null,
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
          resource_url: resourceUrl || null,
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
        <h2 style={{ marginTop: 0, fontSize: 16 }}>📎 Attach a Resource (optional)</h2>
        <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
          Upload an existing worksheet (PDF or image) — student QR codes will be overlaid onto it when generating printed copies, instead of building a page from scratch.
        </p>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleUploadResource} disabled={uploading} />
        {uploading && <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>Uploading…</div>}
        {resourceUrl && <div style={{ fontSize: 13, color: '#1a7a3e', marginTop: 6 }}>✓ Attached: {resourceFile?.name}</div>}
        {uploadError && <div style={{ fontSize: 13, color: '#c00', marginTop: 6 }}>{uploadError}</div>}
      </div>

      <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>🔍 AI Unit Breakdown</h2>
        <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
          Give a topic and grade — AI researches CommonCoreSheets.com's actual skill sequencing and suggests a logical progression of Units, from foundational to advanced.
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
              <div key={i} style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <strong>{i + 1}. {u.title}</strong>
                    <div style={{ fontSize: 12, color: '#666' }}>{u.strand} • Grade {u.grade}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{u.description}</div>
                    <button
                      onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                      style={{ background: 'none', border: 'none', color: '#1c3557', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: 6 }}
                    >
                      {expandedIndex === i ? 'Hide example questions' : 'See example questions'}
                    </button>
                  </div>
                  <button
                    onClick={() => handleAddSuggestion(u, i)}
                    disabled={u.added || addingIndex === i}
                    style={{ padding: '6px 12px', background: u.added ? '#1a7a3e' : '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    {u.added ? '✓ Added' : addingIndex === i ? 'Adding…' : '+ Add This Unit'}
                  </button>
                </div>
                {expandedIndex === i && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee', fontSize: 13 }}>
                    {(u.questionTemplate?.questions || []).map((q, qi) => (
                      <div key={qi} style={{ marginBottom: 4 }}>
                        {qi + 1}. {u.questionTemplate?.randomizable_ranges ? resolveExample(q.prompt, u.questionTemplate.randomizable_ranges) : q.prompt}
                      </div>
                    ))}
                    <div style={{ color: '#888', fontStyle: 'italic', marginTop: 4 }}>
                      Example values shown — {u.randomizable !== false ? 'each student gets different numbers with this same structure.' : 'these exact questions are used for every student.'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdvanced((v) => !v)}
        style={{ background: 'none', border: 'none', color: '#1c3557', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: 0, marginBottom: 12 }}
      >
        {showAdvanced ? '▾ Hide advanced (build manually)' : '▸ Advanced: build a Unit manually'}
      </button>

      {showAdvanced && (
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
      )}
    </main>
  );
}

// Fills placeholders with a representative mid-range value just for preview
// purposes - the real values are randomized fresh per student at generation time.
function resolveExample(prompt, ranges) {
  let out = prompt;
  for (const [key, range] of Object.entries(ranges)) {
    const mid = Math.round((range.min + range.max) / 2);
    out = out.replaceAll(`{${key}}`, mid);
  }
  return out;
}

const inputStyle = { width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' };
