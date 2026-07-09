'use client';
import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// This is the ONLY place a real name and real student data ever appear
// together - and only when you choose to load your local roster file here.
// Supabase never stores names in any form (not even encrypted) - it only
// holds anonymous QR codes and performance data. The join happens live,
// in this browser, from your local file - nothing is saved back.

export default function RosterManagerPage() {
  const supabase = createClientComponentClient();
  const [localRoster, setLocalRoster] = useState(null); // [{qrCode, firstName}]
  const [combined, setCombined] = useState(null); // joined view
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLoadRosterFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const lines = text.trim().split('\n').slice(1); // skip header row
      const roster = lines
        .map((line) => {
          const [qrCode, firstName] = line.split(',');
          return { qrCode: qrCode?.trim(), firstName: firstName?.trim() };
        })
        .filter((r) => r.qrCode && r.firstName);
      setLocalRoster(roster);
      await joinWithCloudData(roster);
    } catch (err) {
      setError('Could not read that roster file: ' + err.message);
    }
  }

  async function joinWithCloudData(roster) {
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const { data: students, error: sErr } = await supabase.from('students').select('*').eq('teacher_id', user.id);
      if (sErr) throw sErr;

      const { data: attempts, error: aErr } = await supabase
        .from('attempts')
        .select('student_id, score_pct, passed_threshold, micro_units(title, strand)')
        .in('student_id', (students || []).map((s) => s.id))
        .order('created_at', { ascending: false });
      if (aErr) throw aErr;

      // The actual join: local name (by qr_code) <-> cloud student id <-> cloud attempts.
      const rows = roster.map((r) => {
        const student = (students || []).find((s) => s.qr_code === r.qrCode);
        const perf = student ? (attempts || []).filter((a) => a.student_id === student.id) : [];
        return { ...r, studentId: student?.id, perf: perf.filter((p) => p.score_pct != null) };
      });
      setCombined(rows);
    } catch (err) {
      setError(err.message || 'Failed to load cloud data');
    }
    setLoading(false);
  }

  function handleExportReportData() {
    if (!combined) return;
    const rows = combined.map((r) => {
      const summary = r.perf.map((p) => `${p.strand || p.unitTitle}: ${p.scorePct}%`).join('; ');
      return `${r.firstName},${r.qrCode},"${summary}"`;
    });
    const csv = 'first_name,qr_code,performance_summary\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-data-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
      <h1>Roster Manager</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        Supabase never stores student names — only anonymous QR codes and performance data. Load your local roster file here to combine names with real results, on demand, entirely in this browser. Nothing gets sent back to the cloud.
      </p>

      {!localRoster && (
        <div style={{ background: '#f9f5ec', border: '1px solid #ddd4c2', borderRadius: 10, padding: 20 }}>
          <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 8 }}>
            Load your local roster file (downloaded when you added students)
          </label>
          <input type="file" accept=".csv" onChange={handleLoadRosterFile} />
        </div>
      )}

      {error && <div style={{ color: '#c00', marginTop: 12 }}>{error}</div>}
      {loading && <div style={{ color: '#666', marginTop: 12 }}>Loading and matching…</div>}

      {combined && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
            <div style={{ color: '#1a7a3e', fontSize: 13 }}>✓ {combined.length} student(s) matched with cloud data</div>
            <button onClick={handleExportReportData} style={{ padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13 }}>
              ⬇ Export Report Data
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: 8 }}>First Name</th>
                <th style={{ padding: 8 }}>QR Code</th>
                <th style={{ padding: 8 }}>Performance</th>
              </tr>
            </thead>
            <tbody>
              {combined.map((r) => (
                <tr key={r.qrCode} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8 }}>{r.firstName}</td>
                  <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>{r.qrCode}</td>
                  <td style={{ padding: 8, fontSize: 13 }}>
                    {r.perf.length === 0 ? (
                      <span style={{ color: '#888', fontStyle: 'italic' }}>No attempts yet</span>
                    ) : (
                      r.perf.slice(0, 3).map((p, i) => (
                        <div key={i}>{r.firstName} scored {p.scorePct}% on {p.micro_units?.strand || p.micro_units?.title} {p.passed_threshold ? '✓' : ''}</div>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
