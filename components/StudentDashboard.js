'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import styles from './StudentDashboard.module.css';
import { CARD_ACCENTS } from '@/lib/studentTheme';

export default function StudentDashboard({ userId }) {
  const supabase = createClientComponentClient();
  const [availableMicroUnits, setAvailableMicroUnits] = useState([]);
  const [studentInfo, setStudentInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

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

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          chalk<span className={styles.brandAccent}>&circuit</span>
        </div>
        <nav className={styles.nav}>
          <span className={`${styles.navItem} ${styles.navItemActive}`}>🏠 Home</span>
          <span className={styles.navItem}>📚 My Units</span>
          <span className={styles.navItem}>📈 Progress</span>
          <span className={styles.navItem}>🏆 Badges</span>
        </nav>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.topBar}>
          <div>
            <h1 className={styles.greeting}>Hi, {firstName}! 👋</h1>
            <p className={styles.subGreeting}>Ready to practice some math today?</p>
          </div>
          {/* MOCK -- no points/streak schema exists yet. Visual only. */}
          <div className={styles.statPills}>
            <span className={styles.statPill}>🔥 -- day streak</span>
            <span className={styles.statPill}>⭐ -- points</span>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <section>
          <h2 className={styles.sectionTitle}>Continue Learning</h2>

          {availableMicroUnits.length === 0 ? (
            <div className={styles.empty}>No units available yet -- check back soon!</div>
          ) : (
            <div className={styles.unitGrid}>
              {availableMicroUnits.map((mu, i) => {
                const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
                return (
                  <div key={mu.id} className={styles.unitCard} style={{ borderTopColor: accent }}>
                    <div className={styles.unitHeader}>
                      <h3>{mu.title}</h3>
                      <span className={styles.grade} style={{ background: accent }}>Grade {mu.grade}</span>
                    </div>
                    <p className={styles.strand}>{mu.strand}</p>
                    <p className={styles.unitMeta}>
                      {mu.question_count} questions • {mu.default_mastery_pct}% to master
                    </p>
                    <Link href={`/practice/${mu.id}`} className={styles.practiceBtn} style={{ background: accent }}>
                      Start Practice →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* MOCK badges strip -- no badge schema exists yet. Visual only,
            shows what the eventual "mastered units" badge system will
            look like once wired to real attempts/passed_threshold data. */}
        <section className={styles.badgesSection}>
          <h2 className={styles.sectionTitle}>🏆 Badges</h2>
          <div className={styles.badgeRow}>
            <div className={styles.badgePlaceholder}>Complete a unit to earn your first badge!</div>
          </div>
        </section>
      </main>
    </div>
  );
}
