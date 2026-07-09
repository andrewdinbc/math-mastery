'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function CreateStudentPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const qr_code = 'STU-' + Math.random().toString(36).slice(2, 10).toUpperCase();
      const { data, error: insertError } = await supabase
        .from('students')
        .insert({ teacher_id: user.id, display_name: displayName, qr_code })
        .select()
        .single();
      if (insertError) throw insertError;
      router.push(`/dashboard/students/${data.id}`);
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
    setSaving(false);
  }

  return (
    <main style={{ padding: 32, maxWidth: 480, margin: '0 auto' }}>
      <h1>Add Student</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          Name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required
            style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </label>
        <button type="submit" disabled={saving} style={{ padding: 10, background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6 }}>
          {saving ? 'Saving…' : 'Add Student'}
        </button>
        {error && <div style={{ color: '#c00' }}>{error}</div>}
      </form>
    </main>
  );
}
