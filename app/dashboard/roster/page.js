'use client';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { generateKey, exportKeyToFile, importKeyFromFileText, encryptName, decryptName } from '@/lib/roster-crypto';

// Roster Manager: the one place where the encryption key is loaded and
// student names get decrypted for viewing/editing. Supabase never sees
// plaintext names - this page does the encrypt/decrypt locally, in-browser,
// using a key that only ever exists on this computer.

export default function RosterManagerPage() {
  const supabase = createClientComponentClient();
  const [cryptoKey, setCryptoKey] = useState(null);
  const [keyStatus, setKeyStatus] = useState('none'); // none | loaded
  const [students, setStudents] = useState([]);
  const [decrypted, setDecrypted] = useState({}); // id -> plaintext first name
  const [edits, setEdits] = useState({}); // id -> edited value
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [performance, setPerformance] = useState({}); // student id -> [{unitTitle, strand, scorePct, passed}]

  async function handleGenerateNewKey() {
    const key = await generateKey();
    await exportKeyToFile(key);
    setCryptoKey(key);
    setKeyStatus('loaded');
  }

  async function handleLoadKeyFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const key = await importKeyFromFileText(text);
      setCryptoKey(key);
      setKeyStatus('loaded');
      setError('');
    } catch (err) {
      setError('Could not read that key file: ' + err.message);
    }
  }

  async function loadRoster() {
    if (!cryptoKey) return;
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const { data, error: fetchErr } = await supabase.from('students').select('*').eq('teacher_id', user.id).order('created_at');
      if (fetchErr) throw fetchErr;
      setStudents(data || []);
      const dec = {};
      for (const s of data || []) {
        dec[s.id] = await decryptName(cryptoKey, s.display_name);
      }
      setDecrypted(dec);

      // Real performance data, joined here (client-side, after decryption)
      // so names and scores can actually be shown together - this is the
      // combined view: decrypted name + real attempt results.
      const { data: attempts } = await supabase
        .from('attempts')
        .select('student_id, score_pct, passed_threshold, micro_units(title, strand)')
        .in('student_id', (data || []).map((s) => s.id))
        .order('created_at', { ascending: false });
      const perf = {};
      for (const a of attempts || []) {
        if (a.score_pct == null) continue; // skip placeholder rows generated at worksheet-creation time
        perf[a.student_id] = perf[a.student_id] || [];
        perf[a.student_id].push({ unitTitle: a.micro_units?.title, strand: a.micro_units?.strand, scorePct: a.score_pct, passed: a.passed_threshold });
      }
      setPerformance(perf);
    } catch (err) {
      setError(err.message || 'Failed to load roster');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (cryptoKey) loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cryptoKey]);

  async function handleSaveEdit(studentId) {
    const newName = edits[studentId];
    if (newName === undefined || newName === decrypted[studentId]) return;
    setSavingId(studentId);
    try {
      const encrypted = await encryptName(cryptoKey, newName);
      const { error: updateErr } = await supabase.from('students').update({ display_name: encrypted }).eq('id', studentId);
      if (updateErr) throw updateErr;
      setDecrypted((prev) => ({ ...prev, [studentId]: newName }));
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[studentId];
        return copy;
      });
    } catch (err) {
      setError(err.message || 'Failed to save edit');
    }
    setSavingId(null);
  }

  function handleDownloadLocalCopy() {
    const rows = students.map((s) => `${s.qr_code},${decrypted[s.id] || ''}`);
    const csv = 'qr_code,first_name\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster-unencrypted-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
      <h1>Roster Manager</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        Student first names are end-to-end encrypted — Supabase only ever stores ciphertext. Decryption happens here, in your browser, using a key that only exists on this computer.
      </p>

      {keyStatus === 'none' && (
        <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 20 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Load or create your encryption key</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontWeight: 700, fontSize: 13 }}>Have a key file already?</label>
              <input type="file" accept=".txt" onChange={handleLoadKeyFile} style={{ display: 'block', marginTop: 4 }} />
            </div>
            <div>
              <label style={{ fontWeight: 700, fontSize: 13 }}>First time here?</label>
              <button onClick={handleGenerateNewKey} style={{ display: 'block', marginTop: 4, padding: '8px 16px', background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6 }}>
                Generate New Key (downloads a keyfile — keep it safe)
              </button>
            </div>
          </div>
        </div>
      )}

      {keyStatus === 'loaded' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ color: '#1a7a3e', fontSize: 13 }}>✓ Key loaded — names below are decrypted locally.</div>
            <button onClick={handleDownloadLocalCopy} disabled={students.length === 0} style={{ padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13 }}>
              ⬇ Download Unencrypted Copy (CSV)
            </button>
          </div>

          {error && <div style={{ color: '#c00', marginBottom: 12 }}>{error}</div>}
          {loading && <div style={{ color: '#666' }}>Loading and decrypting…</div>}

          {!loading && students.length === 0 && <p style={{ color: '#888', fontStyle: 'italic' }}>No students yet.</p>}

          {!loading && students.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th style={{ padding: 8 }}>First Name</th>
                  <th style={{ padding: 8 }}>QR Code</th>
                  <th style={{ padding: 8 }}>Recent Performance</th>
                  <th style={{ padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8 }}>
                      <input
                        value={edits[s.id] !== undefined ? edits[s.id] : decrypted[s.id] || ''}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        style={{ padding: 6, border: '1px solid #ddd4c2', borderRadius: 4 }}
                      />
                    </td>
                    <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>{s.qr_code}</td>
                    <td style={{ padding: 8, fontSize: 12 }}>
                      {(performance[s.id] || []).length === 0 ? (
                        <span style={{ color: '#888', fontStyle: 'italic' }}>No attempts yet</span>
                      ) : (
                        performance[s.id].slice(0, 3).map((p, i) => (
                          <div key={i}>
                            {decrypted[s.id] || 'This student'} scored {p.scorePct}% on {p.strand || p.unitTitle} {p.passed ? '✓' : ''}
                          </div>
                        ))
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      {edits[s.id] !== undefined && edits[s.id] !== decrypted[s.id] && (
                        <button onClick={() => handleSaveEdit(s.id)} disabled={savingId === s.id} style={{ padding: '4px 10px', background: '#1a7a3e', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12 }}>
                          {savingId === s.id ? 'Saving…' : 'Save'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}

