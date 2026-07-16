'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import styles from './StudentDashboard.module.css';
import { CARD_ACCENTS } from '@/lib/studentTheme';
import CloudLayer from '@/components/CloudLayer';

const NAV_ITEMS = [
  { key: 'home', label: 'Home', emoji: '🏠' },
  { key: 'classes', label: 'My Classes', emoji: '📚' },
  { key: 'progress', label: 'Progress', emoji: '📈' },
  { key: 'rewards', label: 'Rewards', emoji: '🏆' },
  { key: 'messages', label: 'Messages', emoji: '✉️' },
]

// Quick Actions -- honest about what's real right now:
// - Mental Math Practice: wired to the real /live-drill flow already
//   built in this app.
// - Oral Reading Fluency: this feature actually lives in the Student
//   Portfolio product (parent-portal repo, app/oral-reading), not here.
//   Flagged rather than silently broken -- cross-product deep-linking
//   needs a shared QR/ID mapping that doesn't exist yet.
// - Story Writing: doesn't exist anywhere in the ecosystem yet.
const QUICK_ACTIONS = [
  { key: 'mental_math', label: 'Mental Math Practice', emoji: '⚡', href: '/live-drill', status: 'real' },
  { key: 'oral_reading', label: 'Oral Reading Fluency', emoji: '📖', href: null, status: 'other_product' },
  { key: 'story_writing', label: 'Story Writing', emoji: '✍️', href: null, status: 'not_built' },
]

function ContinueLearningCard({ unit, status, accent }) {
  const statusLabel = status === 'mastered' ? 'Mastered!' : status === 'in_progress' ? 'In progress' : 'Not started'
  const statusEmoji = status === 'mastered' ? '⭐' : status === 'in_progress' ? '🔵' : '⬜'
  return (
    <Link href={`/practice/${unit.id}`} className={styles.unitWidget} style={{ borderTopColor: accent }}>
      <div className={styles.unitWidgetTop}>
        <span className={styles.unitStrand} style={{ background: accent }}>{unit.strand || 'Math'}</span>
        <span className={styles.unitStatus}>{statusEmoji} {statusLabel}</span>
      </div>
      <h3 className={styles.unitWidgetTitle}>{unit.title}</h3>
      {unit.grade && <p className={styles.unitWidgetMeta}>Grade {unit.grade}</p>}
    </Link>
  )
}

export default function StudentDashboard({ userId }) {
  const supabase = createClientComponentClient();
  const [availableMicroUnits, setAvailableMicroUnits] = useState([]);
  const [unitStatus, setUnitStatus] = useState({});
  const [studentInfo, setStudentInfo] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mascots, setMascots] = useState([]);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [earnedRewards, setEarnedRewards] = useState([]);
  const [showMascotPicker, setShowMascotPicker] = useState(false);

  useEffect(() => {
    fetchData();
    fetch('/api/events').then((r) => r.json()).then((d) => setEvents(d.events || [])).catch(() => {});
    fetch('/api/characters?type=mascot').then((r) => r.json()).then((d) => setMascots(d.characters || [])).catch(() => {});
    fetch('/api/tokens').then((r) => r.json()).then((d) => setTokenBalance(d.balance || 0)).catch(() => {});
    fetch('/api/rewards?mode=earned').then((r) => r.json()).then((d) => setEarnedRewards(d.earned || [])).catch(() => {});
  }, []);

  async function selectMascot(characterId) {
    setShowMascotPicker(false);
    await fetch('/api/characters/select', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId, slot: 'mascot' }),
    });
    fetchData();
  }

  const fetchData = async () => {
    try {
      setError('');
      setLoading(true);

      const { data: stdData, error: stdError } = await supabase
        .from('mastery_students')
        .select('*')
        .eq('id', userId)
        .single();

      if (stdError && stdError.code !== 'PGRST116') throw stdError;

      if (!stdData) {
        setError('Student profile not found. Please contact your teacher.');
        return;
      }

      setStudentInfo(stdData);

      const { data: muData, error: muError } = await supabase
        .from('mastery_micro_units')
        .select('*')
        .eq('teacher_id', stdData.teacher_id)
        .order('created_at', { ascending: false });

      if (muError) throw muError;

      setAvailableMicroUnits(muData || []);

      // Real per-unit progress, same source of truth as the mobile
      // practice-home flow (mastery_attempts.passed_threshold).
      const { data: attempts } = await supabase
        .from('mastery_attempts')
        .select('micro_unit_id, passed_threshold')
        .eq('student_id', stdData.id);

      const statusMap = {};
      for (const unit of muData || []) {
        const unitAttempts = (attempts || []).filter((a) => a.micro_unit_id === unit.id);
        if (unitAttempts.some((a) => a.passed_threshold)) statusMap[unit.id] = 'mastered';
        else if (unitAttempts.length > 0) statusMap[unit.id] = 'in_progress';
        else statusMap[unit.id] = 'not_started';
      }
      setUnitStatus(statusMap);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.loadingScreen}>Loading…</div>;
  }

  const firstName = (studentInfo?.display_name || 'Student').split(' ')[0];
  const masteredCount = Object.values(unitStatus).filter((s) => s === 'mastered').length;

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          chalk<span className={styles.brandAccent}>&circuit</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item, i) => (
            <a key={item.key} href={`#${item.key}`} className={`${styles.navItem} ${i === 0 ? styles.navItemActive : ''}`}>
              {item.emoji} {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className={styles.main} id="home">
        <CloudLayer />

        <div className={styles.content}>
          <div className={styles.topBar}>
            <div className={styles.identityRow}>
              {/* Avatar/mascot space -- click to pick from teacher-enabled
                  characters. Avatar slot (representing the student) isn't
                  populated yet -- male/female avatar assets are still
                  coming from Aj. */}
              <div className={styles.avatarSpace} onClick={() => setShowMascotPicker((v) => !v)} title="Choose your mascot">
                {studentInfo?.selected_mascot_id && mascots.find((m) => m.id === studentInfo.selected_mascot_id) ? (
                  <img
                    src={mascots.find((m) => m.id === studentInfo.selected_mascot_id).image_url}
                    alt="Your mascot"
                    className={styles.avatarImg}
                  />
                ) : (
                  <span className={styles.avatarPlaceholder}>+ Pick a mascot</span>
                )}
                {showMascotPicker && (
                  <div className={styles.mascotPicker} onClick={(e) => e.stopPropagation()}>
                    {mascots.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#8B87A0' }}>No mascots enabled yet -- ask your teacher!</p>
                    ) : (
                      mascots.map((m) => (
                        <img key={m.id} src={m.image_url} alt={m.name} className={styles.mascotOption} onClick={() => selectMascot(m.id)} />
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <h1 className={styles.greeting}>Hi, {firstName}! 👋</h1>
                <p className={styles.subGreeting}>Ready to practice some math today?</p>
              </div>
            </div>
            <div className={styles.statPills}>
              {/* MOCK -- no streak schema exists yet. Visual only. */}
              <span className={styles.statPill}>🔥 -- day streak</span>
              {/* Real -- from mastery_token_transactions, +1 per unit first-mastered. */}
              <span className={styles.statPill}>⭐ {tokenBalance} token{tokenBalance !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <section id="classes">
            <h2 className={styles.sectionTitle}>Continue Learning</h2>

            {availableMicroUnits.length === 0 ? (
              <div className={styles.empty}>No units available yet -- check back soon!</div>
            ) : (
              <div className={styles.unitGrid}>
                {availableMicroUnits.map((mu, i) => (
                  <ContinueLearningCard
                    key={mu.id}
                    unit={mu}
                    status={unitStatus[mu.id] || 'not_started'}
                    accent={CARD_ACCENTS[i % CARD_ACCENTS.length]}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={styles.quickActionsSection}>
            <h2 className={styles.sectionTitle}>Quick Actions</h2>
            <div className={styles.quickActionsRow}>
              {QUICK_ACTIONS.map((qa) => (
                qa.status === 'real' ? (
                  <Link key={qa.key} href={qa.href} className={styles.quickAction}>
                    <span className={styles.quickActionEmoji}>{qa.emoji}</span>
                    {qa.label}
                  </Link>
                ) : (
                  <div key={qa.key} className={`${styles.quickAction} ${styles.quickActionDisabled}`} title={
                    qa.status === 'other_product'
                      ? 'This lives in the Student Portfolio app -- not linked here yet.'
                      : "This hasn't been built yet."
                  }>
                    <span className={styles.quickActionEmoji}>{qa.emoji}</span>
                    {qa.label}
                    <span className={styles.comingSoonBadge}>Coming soon</span>
                  </div>
                )
              ))}
            </div>
          </section>

          {/* Rewards -- real, teacher-defined badges/prizes, awarded via
              the teacher dashboard's Rewards manager. */}
          <section id="rewards" className={styles.rewardsSection}>
            <h2 className={styles.sectionTitle}>🏆 My Rewards</h2>
            <p className={styles.sectionSubtitle}>Earn rewards for finishing units and going above and beyond!</p>
            {earnedRewards.length === 0 ? (
              <div className={styles.rewardPlaceholder}>Master your first unit to earn a reward!</div>
            ) : (
              <div className={styles.rewardRow}>
                {earnedRewards.map((er) => (
                  <div key={er.id} className={styles.rewardBadge} style={{
                    background: er.mastery_rewards?.reward_type === 'prize' ? '#F4B740' : '#7C5CFC',
                  }} title={er.mastery_rewards?.name}>
                    {er.mastery_rewards?.reward_type === 'prize' ? '🎁' : '🎖️'}
                  </div>
                ))}
                <span className={styles.rewardCaption}>{earnedRewards.length} reward{earnedRewards.length !== 1 ? 's' : ''} earned</span>
              </div>
            )}
          </section>

          <section id="calendar" className={styles.calendarSection}>
            <h2 className={styles.sectionTitle}>📅 Upcoming</h2>
            {events.length === 0 ? (
              <div className={styles.empty}>Nothing on the calendar yet.</div>
            ) : (
              <div className={styles.calendarList}>
                {events.map((ev) => (
                  <div key={ev.id} className={styles.calendarItem}>
                    <div className={styles.calendarDate}>
                      {new Date(ev.event_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                    <div>
                      <div className={styles.calendarTitle}>{ev.title}</div>
                      {ev.description && <div className={styles.calendarDesc}>{ev.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="messages" className={styles.messagesSection}>
            <h2 className={styles.sectionTitle}>✉️ Messages</h2>
            <div className={styles.empty}>No messages yet.</div>
          </section>
        </div>
      </main>
    </div>
  );
}

