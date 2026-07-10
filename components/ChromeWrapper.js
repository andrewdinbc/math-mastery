'use client';
import { usePathname } from 'next/navigation';
import NavBar from './NavBar';
import UpsellSidebar from './UpsellSidebar';

// Student-facing pages (/practice, /join) must never show the teacher's
// NavBar, unit sidebar, or Dev Mode button - a student opening their
// worksheet link was seeing all of that teacher chrome wrapped around
// their page, which looked like landing on the teacher's own tools instead
// of their actual worksheet. This strips it for those routes only.
export default function ChromeWrapper({ session, children, devModePanel }) {
  const pathname = usePathname();
  const isStudentFacing = pathname?.startsWith('/practice') || pathname?.startsWith('/join');

  if (isStudentFacing) {
    return <>{children}</>;
  }

  return (
    <>
      <UpsellSidebar />
      <div style={{ marginLeft: 130 }}>
        <NavBar session={session} />
        {children}
      </div>
      {devModePanel}
    </>
  );
}
