'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function CreateStudentPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [namesText, setNamesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addedCount, setAddedCount] = useState(0);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setAddedCount(0);
    try {
      const names = namesText
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean);
      if (names.length === 0) throw new Error('Enter at least one name');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const rows = names.map((display_name) => ({
        teacher_id: user.id,
        display_name,
        qr_code: 'STU-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      }));

      const { data, error: insertError } = await supabase.from('students').insert(rows).select();
      if (insertError) throw insertError;

      setAddedCount(data.length);
      if (data.length === 1) {
        router.push(`/dashboard/students/${data[0].id}`);
      } else {
        router.push('/dashboard');
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
        One name per line — add your whole class at once. Each gets a unique QR code automatically.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          Names (one per line)
          <textarea
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            required
            rows={10}
            placeholder={'Jamie Chen\nAlex Rivera\nSam Patel'}
            style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </label>
        <button type="submit" disabled={saving} style={{ padding: 10, background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6 }}>
          {saving ? 'Saving…' : 'Add Students'}
        </button>
        {error && <div style={{ color: '#c00' }}>{error}</div>}
      </form>
    </main>
  );
}
