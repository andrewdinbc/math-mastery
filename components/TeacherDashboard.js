'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import styles from './TeacherDashboard.module.css';

function DisplaySettings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch('/api/display-settings').then((r) => r.json()).then((d) => setSettings(d.settings)).catch(() => {});
  }, []);
  async function save(next) {
    setSettings(next);
    setSaving(true);
    try {
      await fetch('/api/display-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    } finally {
      setSaving(false);
    }
  }
  if (!settings) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#1c3557', marginBottom: 10, fontSize: 14 }}>⚙️ Progress Display Settings {saving && <span style={{ fontSize: 11, color: '#8a7d6e' }}>(saving…)</span>}</div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: '#8a7d6e', display: 'block', marginBottom: 4 }}>Students see scores as:</label>
        <select value={settings.score_display_mode} onChange={(e) => save({ ...settings, score_display_mode: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }}>
          <option value="percentage">Percentage</option>
          <option value="letter">Letter Grade</option>
          <option value="scale">4-Point Scale</option>
          <option value="feedback_only">Feedback Only (no number)</option>
        </select>
      </div>
      <div style={{ fontSize: 12, color: '#8a7d6e', marginBottom: 6 }}>Parents can see:</div>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
        <input type="checkbox" checked={settings.parent_show_scores} onChange={(e) => save({ ...settings, parent_show_scores: e.target.checked })} /> Scores
      </label>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
        <input type="checkbox" checked={settings.parent_show_feedback} onChange={(e) => save({ ...settings, parent_show_feedback: e.target.checked })} /> Written feedback
      </label>
      <label style={{ display: 'block', fontSize: 13 }}>
        <input type="checkbox" checked={settings.parent_show_baseline} onChange={(e) => save({ ...settings, parent_show_baseline: e.target.checked })} /> Start-of-year baseline (students never see this, regardless of this setting)
      </label>
    </div>
  );
}

function OffTaskAlerts() {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    function load() {
      fetch('/api/off-task-alerts').then((r) => r.json()).then((d) => setAlerts(d.alerts || [])).catch(() => {});
    }
    load();
    const interval = setInterval(load, 20000); // poll every 20s while the dashboard is open - not a background service, only while a teacher has this page open
    return () => clearInterval(interval);
  }, []);
  if (!alerts.length) return null;
  return (
    <div style={{ background: '#fdecea', border: '1px solid #f5b7b1', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#c0392b', marginBottom: 6, fontSize: 14 }}>🚨 Off-task in the last 30 minutes</div>
      {alerts.map((a) => (
        <div key={a.id} style={{ fontSize: 13, color: '#8a3a34' }}>
          {a.student?.display_name || a.student?.qr_code || 'A student'} — {a.reason === 'tab_hidden' ? 'left the tab' : a.reason === 'window_blur' ? 'switched away' : a.reason} at {new Date(a.created_at).toLocaleTimeString()}
        </div>
      ))}
    </div>
  );
}

export default function TeacherDashboard({ userId }) {
  const supabase = createClientComponentClient();
  const [microUnits, setMicroUnits] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setError('');
      setLoading(true);

      // Fetch micro_units
      const { data: muData, error: muError } = await supabase
        .from('mastery_micro_units')
        .select('*')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false });

      if (muError) throw muError;

      // Fetch students
      const { data: stdData, error: stdError } = await supabase
        .from('mastery_students')
        .select('*')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: true }); // display_name is encrypted - sorting by it is meaningless

      if (stdError) throw stdError;

      setMicroUnits(muData || []);
      setStudents(stdData || []);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.container}>Loading...</div>;
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1>Teacher Dashboard</h1>

        <DisplaySettings />
        <OffTaskAlerts />

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.grid}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Units ({microUnits.length})</h2>
              <Link href="/dashboard/micro-units/create" className={styles.createBtn}>
                + Create
              </Link>
            </div>

            {microUnits.length === 0 ? (
              <p className={styles.empty}>No units yet</p>
            ) : (
              <div className={styles.list}>
                {microUnits.map((mu) => (
                  <div key={mu.id} className={styles.item}>
                    <div className={styles.itemContent}>
                      <h3>{mu.title}</h3>
                      <p className={styles.itemMeta}>
                        Grade {mu.grade} • {mu.strand}
                      </p>
                      <p className={styles.itemMeta}>
                        {mu.question_count} questions • {mu.default_mastery_pct}% mastery
                        {mu.randomizable && ' • Randomizable'}
                      </p>
                    </div>
                    <div className={styles.itemActions}>
                      <Link href={`/dashboard/micro-units/${mu.id}`}>View</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Students ({students.length})</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link href="/dashboard/roster" style={{ fontSize: 13, color: '#1c3557' }}>
                  🔒 Roster Manager
                </Link>
                <Link href="/dashboard/students/create" className={styles.createBtn}>
                  + Add
                </Link>
              </div>
            </div>

            {students.length === 0 ? (
              <p className={styles.empty}>No students yet</p>
            ) : (
              <div className={styles.list}>
                {students.map((student) => (
                  <div key={student.id} className={styles.item}>
                    <div className={styles.itemContent}>
                      <h3>Student ({student.qr_code})</h3>
                      {student.qr_code && (
                        <p className={styles.itemMeta}>QR: {student.qr_code}</p>
                      )}
                    </div>
                    <div className={styles.itemActions}>
                      <Link href={`/dashboard/students/${student.id}`}>View</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}


