import './globals.css';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import NavBar from '@/components/NavBar';

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
