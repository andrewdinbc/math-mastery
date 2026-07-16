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

function EventsManager() {
  const [events, setEvents] = useState([]);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => fetch('/api/events').then((r) => r.json()).then((d) => setEvents(d.events || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function addEvent(e) {
    e.preventDefault();
    if (!title.trim() || !eventDate) return;
    setSaving(true);
    try {
      await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), eventDate, description: description.trim() || null }),
      });
      setTitle(''); setEventDate(''); setDescription('');
      load();
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id) {
    await fetch(`/api/events?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#1c3557', marginBottom: 10, fontSize: 14 }}>📅 Upcoming Events (shown on students' calendars)</div>
      <form onSubmit={addEvent} style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }} />
        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }} />
        <button type="submit" disabled={saving} style={{
          padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6,
          fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Adding…' : '+ Add'}
        </button>
      </form>
      {events.length === 0 ? (
        <p style={{ fontSize: 13, color: '#8a7d6e' }}>No upcoming events yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {events.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderTop: '1px solid #f0ece1' }}>
              <span><strong>{new Date(ev.event_date + 'T00:00:00').toLocaleDateString()}</strong> — {ev.title}</span>
              <button onClick={() => removeEvent(ev.id)} style={{ background: 'none', border: 'none', color: '#c0392b', fontSize: 12, cursor: 'pointer' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CharactersManager() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => fetch('/api/characters').then((r) => r.json()).then((d) => { setCharacters(d.characters || []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function toggle(characterId, enabled) {
    setCharacters((prev) => prev.map((c) => c.id === characterId ? { ...c, enabled } : c));
    await fetch('/api/characters', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId, enabled }),
    });
  }

  if (loading) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#1c3557', marginBottom: 10, fontSize: 14 }}>🦊 Characters</div>
      <p style={{ fontSize: 12, color: '#8a7d6e', marginBottom: 12 }}>Choose which mascots and avatars your students can pick from.</p>
      {characters.length === 0 ? (
        <p style={{ fontSize: 13, color: '#8a7d6e' }}>No characters added yet.</p>
      ) : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {characters.map((c) => (
            <label key={c.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer',
              opacity: c.enabled ? 1 : 0.4, width: 84,
            }}>
              <img src={c.image_url} alt={c.name} style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 10, background: '#f7f5f0' }} />
              <span style={{ fontSize: 11, textAlign: 'center', color: '#1c3557', fontWeight: 600 }}>{c.name}</span>
              <input type="checkbox" checked={c.enabled} onChange={(e) => toggle(c.id, e.target.checked)} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RewardsManager({ students }) {
  const [rewards, setRewards] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rewardType, setRewardType] = useState('badge');
  const [saving, setSaving] = useState(false);
  const [awardStudentId, setAwardStudentId] = useState('');
  const [awardRewardId, setAwardRewardId] = useState('');
  const [awarding, setAwarding] = useState(false);

  const load = () => fetch('/api/rewards').then((r) => r.json()).then((d) => setRewards(d.rewards || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function createReward(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/rewards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, rewardType }),
      });
      setName(''); setDescription('');
      load();
    } finally {
      setSaving(false);
    }
  }

  async function removeReward(id) {
    await fetch(`/api/rewards?id=${id}`, { method: 'DELETE' });
    load();
  }

  async function awardReward(e) {
    e.preventDefault();
    if (!awardStudentId || !awardRewardId) return;
    setAwarding(true);
    try {
      await fetch('/api/rewards/award', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: awardStudentId, rewardId: awardRewardId }),
      });
      setAwardStudentId(''); setAwardRewardId('');
      alert('Reward awarded!');
    } finally {
      setAwarding(false);
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd4c2', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#1c3557', marginBottom: 10, fontSize: 14 }}>🏆 Rewards</div>
      <p style={{ fontSize: 12, color: '#8a7d6e', marginBottom: 12 }}>
        Create badges (virtual) or prizes (something real you hand over) students can earn for going above and beyond.
      </p>

      <form onSubmit={createReward} style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Reward name" value={name} onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }} />
        <input type="text" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)}
          style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }} />
        <select value={rewardType} onChange={(e) => setRewardType(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }}>
          <option value="badge">Badge (virtual)</option>
          <option value="prize">Prize (real item)</option>
        </select>
        <button type="submit" disabled={saving} style={{
          padding: '8px 16px', background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 6,
          fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Adding…' : '+ Add'}
        </button>
      </form>

      {rewards.length === 0 ? (
        <p style={{ fontSize: 13, color: '#8a7d6e', marginBottom: 14 }}>No rewards defined yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {rewards.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderTop: '1px solid #f0ece1' }}>
              <span>{r.reward_type === 'badge' ? '🎖️' : '🎁'} <strong>{r.name}</strong> {r.description && `— ${r.description}`}</span>
              <button onClick={() => removeReward(r.id)} style={{ background: 'none', border: 'none', color: '#c0392b', fontSize: 12, cursor: 'pointer' }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {students.length > 0 && rewards.length > 0 && (
        <form onSubmit={awardReward} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #f0ece1' }}>
          <select value={awardStudentId} onChange={(e) => setAwardStudentId(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }}>
            <option value="">Award to student…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.qr_code}</option>)}
          </select>
          <select value={awardRewardId} onChange={(e) => setAwardRewardId(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd4c2' }}>
            <option value="">Choose reward…</option>
            {rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="submit" disabled={awarding} style={{
            padding: '8px 16px', background: '#1c3557', color: '#fff', border: 'none', borderRadius: 6,
            fontWeight: 600, cursor: awarding ? 'not-allowed' : 'pointer', opacity: awarding ? 0.6 : 1,
          }}>
            {awarding ? 'Awarding…' : 'Award'}
          </button>
        </form>
      )}
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
        <EventsManager />
        <CharactersManager />
        <RewardsManager students={students} />
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




