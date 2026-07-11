'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Supabase never receives a name in any form here - not plaintext, not
// encrypted. It only ever gets anonymous QR-code placeholders. The name is
// held in this browser's memory only and must be downloaded to your local
// roster file before you navigate away, or it's gone (by design - there is
// nowhere else it's stored).

export default function CreateStudentPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [namesText, setNamesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // [{qrCode, firstName}]

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setCreated(null);
    try {
      const names = namesText.split('\n').map((n) => n.trim()).filter(Boolean);
      if (names.length === 0) throw new Error('Enter at least one first name');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      // Anonymous placeholders only - no name field sent to Supabase at all.
      const rows = names.map(() => ({
        teacher_id: user.id,
        qr_code: 'STU-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      }));

      const { data, error: insertError } = await supabase.from('mastery_students').insert(rows).select();
      if (insertError) throw insertError;

      // Pair the returned QR codes with the names IN THIS BROWSER ONLY -
      // this pairing is never sent anywhere.
      setCreated(data.map((row, i) => ({ qrCode: row.qr_code, firstName: names[i] })));
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
    setSaving(false);
  }

  function handleDownloadRoster() {
    const rows = created.map((c) => `${c.qrCode},${c.firstName}`);
    const csv = 'qr_code,first_name\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roster-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ padding: 32, maxWidth: 480, margin: '0 auto' }}>
      <h1>Add Students</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        First name only. These names are <strong>never sent to the cloud</strong> — Supabase only ever stores an anonymous QR code. The name pairing exists only in this browser until you download it below.
      </p>

      {!created && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            First Names (one per line)
            <textarea
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              required
              rows={10}
              placeholder={'Jamie\nAlex\nSam'}
              style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </label>
          <button type="submit" disabled={saving} style={{ padding: 10, background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6 }}>
            {saving ? 'Creating…' : 'Add Students'}
          </button>
          {error && <div style={{ color: '#c00' }}>{error}</div>}
        </form>
      )}

      {created && (
        <div style={{ background: '#fff8ee', border: '1px solid #ddd4c2', borderRadius: 10, padding: 20 }}>
          <div style={{ color: '#b57c2a', fontWeight: 700, marginBottom: 8 }}>⚠️ Download this now — it's the only copy</div>
          <p style={{ fontSize: 13, color: '#666' }}>
            {created.length} student(s) created. This is the only place the name-to-QR-code pairing exists. If you navigate away without downloading, it's gone for good (Supabase never stores it).
          </p>
          <ul style={{ fontSize: 13 }}>
            {created.map((c) => <li key={c.qrCode}>{c.firstName} — {c.qrCode}</li>)}
          </ul>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDownloadRoster} style={{ padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700 }}>
              ⬇ Download Roster File
            </button>
            <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #ddd4c2', borderRadius: 6 }}>
              Done (I've saved it)
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
