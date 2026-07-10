'use client';
import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function CreateMicroUnitPage() {
  const supabase = createClientComponentClient();
  const [aiTopic, setAiTopic] = useState('');
  const [aiGrade, setAiGrade] = useState('');
  const [language, setLanguage] = useState('english');
  const [researching, setResearching] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestError, setSuggestError] = useState('');
  const [addingIndex, setAddingIndex] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const [resourceFile, setResourceFile] = useState(null);
  const [resourceUrl, setResourceUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

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
        body: JSON.stringify({ topic: aiTopic, grade: aiGrade, resourceUrl: resourceUrl || null, language }),
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

      // sequence_order controls presentation order in the sidebar - append
      // after whatever the teacher already has, in the order suggestions
      // are added (matching the AI's foundational-to-advanced sequence).
      const { count } = await supabase.from('micro_units').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id);

      const { data, error: insertError } = await supabase
        .from('micro_units')
        .insert({
          teacher_id: user.id,
          title: unit.title,
          grade: unit.grade,
          strand: unit.strand,
          question_template: unit.questionTemplate,
          randomizable: true,
          default_mastery_pct: 80,
          question_count: unit.questionTemplate?.questions?.length || 1,
          resource_url: resourceUrl || null,
          video_url: unit.videoUrl || null,
          sequence_order: (count || 0) + index,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      setSuggestions((prev) => prev.map((u, i) => (i === index ? { ...u, added: true, newId: data.id } : u)));
    } catch (err) {
      setSuggestError(err.message || 'Failed to add unit');
    }
    setAddingIndex(null);
  }

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

  return (
    <main style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <h1>Create Unit</h1>

      <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>🔍 AI Unit Breakdown</h2>
        <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
          Give a topic and grade — AI researches CommonCoreSheets.com's actual skill sequencing and suggests a logical progression of Units, from foundational to advanced.
        </p>

        <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4 }}>📎 Upload an example worksheet or lesson (optional)</label>
          <p style={{ fontSize: 12, color: '#666', marginTop: 0, marginBottom: 8 }}>
            The AI will actually read this file as reference material when researching — matching your existing worksheet style, level, or lesson content.
          </p>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleUploadResource} disabled={uploading} />
          {uploading && <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>Uploading…</div>}
          {resourceUrl && <div style={{ fontSize: 13, color: '#1a7a3e', marginTop: 6 }}>✓ Attached: {resourceFile?.name}</div>}
          {uploadError && <div style={{ fontSize: 13, color: '#c00', marginTop: 6 }}>{uploadError}</div>}
        </div>

        <form onSubmit={handleResearch} style={{ display: 'flex', gap: 8 }}>
          <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="e.g. Using Substitutions to Solve Problems" required style={{ ...inputStyle, marginTop: 0, flex: 2 }} />
          <input value={aiGrade} onChange={(e) => setAiGrade(e.target.value)} placeholder="Grade" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputStyle, marginTop: 0, flex: 1 }}>
            <option value="english">English</option>
            <option value="french">Français</option>
            <option value="spanish">Español</option>
          </select>
          <button type="submit" disabled={researching} style={{ padding: '0 16px', background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {researching ? 'Researching…' : 'Research & Suggest'}
          </button>
        </form>
        {suggestError && <div style={{ color: '#c00', marginTop: 10, fontSize: 13 }}>{suggestError}</div>}
        {suggestions && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {suggestions.map((u, i) => (
              <div
                key={i}
                style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8, padding: 12, position: 'relative' }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <strong>{i + 1}. {u.title}</strong>
                    <div style={{ fontSize: 12, color: '#666' }}>{u.strand} • Grade {u.grade}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{u.description}</div>
                    <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 4 }}>Hover to preview the worksheet page →</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => handleAddSuggestion(u, i)}
                      disabled={u.added || addingIndex === i}
                      style={{ padding: '6px 12px', background: u.added ? '#1a7a3e' : '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                    >
                      {u.added ? '✓ Added' : addingIndex === i ? 'Adding…' : '+ Add This Unit'}
                    </button>
                    {u.added && u.newId && (
                      <div style={{ marginTop: 4 }}>
                        <a href={`/dashboard/micro-units/${u.newId}`} style={{ fontSize: 12, color: '#1c3557', fontWeight: 700 }}>View Unit →</a>
                      </div>
                    )}
                  </div>
                </div>

                {hoveredIndex === i && (
                  <div style={{
                    position: 'absolute', left: '100%', top: 0, marginLeft: 12, zIndex: 20,
                    width: 340, background: '#fff', border: '1px solid #ddd4c2', borderRadius: 8,
                    padding: 16, boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #222', paddingBottom: 6, marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{u.title}</div>
                      <div style={{ fontSize: 10 }}>Name: _______</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 11 }}>
                      {(u.questionTemplate?.questions || []).map((q, qi) => (
                        <div key={qi}>
                          <strong>{qi + 1})</strong> {u.questionTemplate?.randomizable_ranges ? resolveExample(q.prompt, u.questionTemplate.randomizable_ranges) : q.prompt}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: '#888', fontStyle: 'italic', marginTop: 10, borderTop: '1px solid #eee', paddingTop: 6 }}>
                      Example page — each student's real copy has more questions and different random numbers.
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle = { width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' };

