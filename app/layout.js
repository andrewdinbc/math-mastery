// force fresh deploy of all 4 missing pages 1783634715
import './globals.css';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import DevModePanel from '@/developer-mode/DevModePanel';
import ChromeWrapper from '@/components/ChromeWrapper';

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
        <ChromeWrapper
          session={session}
          devModePanel={
            <DevModePanel
              productName="Mastery Studio"
              sourceRepo="andrewdinbc/math-mastery"
              userEmail="andrewsinbc3@gmail.com"
              userKey="owner"
              morpheusUrl="https://morpheus-scheduler.vercel.app"
              enabled={true}
              audienceLabel="a K-12 teacher using mastery-based math practice"
              mode="personal"
            />
          }
        >
          {children}
        </ChromeWrapper>
      </body>
    </html>
  );
}
