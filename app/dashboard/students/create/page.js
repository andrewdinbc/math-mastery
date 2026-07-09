'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { generateKey, exportKeyToFile, importKeyFromFileText, encryptName } from '@/lib/roster-crypto';

export default function CreateStudentPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [cryptoKey, setCryptoKey] = useState(null);
  const [namesText, setNamesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleGenerateNewKey() {
    const key = await generateKey();
    await exportKeyToFile(key);
    setCryptoKey(key);
  }

  async function handleLoadKeyFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const key = await importKeyFromFileText(text);
      setCryptoKey(key);
      setError('');
    } catch (err) {
      setError('Could not read that key file: ' + err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cryptoKey) {
      setError('Load or generate your encryption key first (above) — names are encrypted before being saved.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const names = namesText.split('\n').map((n) => n.trim()).filter(Boolean);
      if (names.length === 0) throw new Error('Enter at least one first name');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const rows = [];
      for (const firstName of names) {
        const encrypted = await encryptName(cryptoKey, firstName);
        rows.push({
          teacher_id: user.id,
          display_name: encrypted,
          qr_code: 'STU-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
        });
      }

      const { data, error: insertError } = await supabase.from('students').insert(rows).select();
      if (insertError) throw insertError;

      if (data.length === 1) {
        router.push(`/dashboard/students/${data[0].id}`);
      } else {
        router.push('/dashboard/roster');
      }
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
    setSaving(false);
  }

  return (
    <main style={{ padding: 32, maxWidth: 480, margin: '0 auto' }}>
      <h1>Add Students</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        First name only — names are end-to-end encrypted before saving, so Supabase never sees plaintext.
      </p>

      {!cryptoKey && (
        <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Load your encryption key first</div>
          <input type="file" accept=".txt" onChange={handleLoadKeyFile} style={{ display: 'block', marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>— or, if this is your first time —</div>
          <button onClick={handleGenerateNewKey} style={{ padding: '6px 12px', background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13 }}>
            Generate New Key
          </button>
        </div>
      )}
      {cryptoKey && <div style={{ color: '#1a7a3e', fontSize: 13, marginBottom: 12 }}>✓ Key loaded</div>}

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
          {saving ? 'Encrypting & Saving…' : 'Add Students'}
        </button>
        {error && <div style={{ color: '#c00' }}>{error}</div>}
      </form>
    </main>
  );
}
