import './globals.css';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import NavBar from '@/components/NavBar';

// force-dynamic: this layout calls supabase.auth.getSession() on every
// render, which requires real env vars at request time - without this,
// Next.js tries to statically prerender it (and every page under it,
// including auto-generated ones like /_not-found) at BUILD time, when env
// vars may not be set yet, causing 'Invalid supabaseUrl' build failures.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Mastery Studio',
  description: 'Self-paced mastery-gated math practice',
};

export default async function RootLayout({ children }) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="en">
      <body>
        <NavBar session={session} />
        {children}
      </body>
    </html>
  );
}
