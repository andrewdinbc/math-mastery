'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useState } from 'react';
import styles from './NavBar.module.css';

export default function NavBar({ session }) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          Math Mastery Studio
        </Link>
        <div className={styles.menu}>
          {session ? (
            <>
              <Link href="/dashboard" className={styles.link}>
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                disabled={loading}
                className={styles.logoutBtn}
              >
                {loading ? 'Logging out...' : 'Logout'}
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className={styles.link}>
                Login
              </Link>
              <Link href="/auth/signup" className={styles.link}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
