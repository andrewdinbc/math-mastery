'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import styles from './TeacherDashboard.module.css';

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
        .from('micro_units')
        .select('*')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false });

      if (muError) throw muError;

      // Fetch students
      const { data: stdData, error: stdError } = await supabase
        .from('students')
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

