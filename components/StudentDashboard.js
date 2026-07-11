'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import styles from './StudentDashboard.module.css';

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

      // Get student record
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

      // Get available micro_units from teacher
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
    return <div className={styles.container}>Loading...</div>;
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1>Hello, {studentInfo?.display_name || 'Student'}!</h1>

        {error && <div className={styles.error}>{error}</div>}

        <section className={styles.section}>
          <h2>Available Practice</h2>

          {availableMicroUnits.length === 0 ? (
            <p className={styles.empty}>No micro-units available yet</p>
          ) : (
            <div className={styles.unitGrid}>
              {availableMicroUnits.map((mu) => (
                <div key={mu.id} className={styles.unitCard}>
                  <div className={styles.unitHeader}>
                    <h3>{mu.title}</h3>
                    <span className={styles.grade}>Grade {mu.grade}</span>
                  </div>
                  <p className={styles.strand}>{mu.strand}</p>
                  <p className={styles.unitMeta}>
                    {mu.question_count} questions • {mu.default_mastery_pct}% to pass
                  </p>
                  <Link
                    href={`/practice/${mu.id}`}
                    className={styles.practiceBtn}
                  >
                    Start Practice
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
