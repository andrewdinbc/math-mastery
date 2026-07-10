import Link from 'next/link';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import styles from './page.module.css';

// force-dynamic: same bug class fixed elsewhere - without this, Next.js
// can serve a stale cached 'no session' result even when the user is
// actually logged in, making clicking the logo look like it logs you out.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1>Math Mastery Studio</h1>
        <p className={styles.subtitle}>
          Self-paced, mastery-gated math practice
        </p>

        <div className={styles.features}>
          <div className={styles.feature}>
            <h3>For Students</h3>
            <p>Practice at your own pace until you master each concept</p>
          </div>
          <div className={styles.feature}>
            <h3>For Teachers</h3>
            <p>Track student progress and customize mastery thresholds</p>
          </div>
          <div className={styles.feature}>
            <h3>AI-Powered</h3>
            <p>Instant feedback and targeted mini-lessons on mistakes</p>
          </div>
        </div>

        <div className={styles.cta}>
          <Link href="/auth/login" className={styles.primaryBtn}>
            Login
          </Link>
          <Link href="/auth/signup" className={styles.secondaryBtn}>
            Sign Up
          </Link>
        </div>
      </div>
    </main>
  );
}
