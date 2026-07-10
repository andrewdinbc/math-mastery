'use client';
import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Narrow sidebar - now doubles as a unit navigator, listing the teacher's
// units in the order they'll be presented (sequence_order, set when a
// unit is added via AI Research), plus the existing upsell content below.

export default function UpsellSidebar() {
  const supabase = createClientComponentClient();
  const pathname = usePathname();
  const [units, setUnits] = useState([]);

  const fetchUnits = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('micro_units')
      .select('id, title, sequence_order, created_at')
      .eq('teacher_id', user.id)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    setUnits(data || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch whenever the route changes (fallback) and immediately when a
  // unit is added via the custom event Create Unit dispatches - this
  // sidebar is mounted once at the app level, so it wouldn't otherwise see
  // a newly added unit until something explicitly tells it to look again.
  useEffect(() => {
    fetchUnits();
  }, [pathname, fetchUnits]);

  useEffect(() => {
    window.addEventListener('mm-unit-added', fetchUnits);
    return () => window.removeEventListener('mm-unit-added', fetchUnits);
  }, [fetchUnits]);

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: 130,
        background: '#1c3557',
        color: '#fff',
        padding: '20px 12px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontSize: 11,
        lineHeight: 1.5,
        zIndex: 40,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.3 }}>📚 YOUR UNITS</div>
        <a
          href="/dashboard/micro-units/create"
          title="Create Unit"
          style={{
            width: 18, height: 18, borderRadius: 4, background: '#b57c2a', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            fontWeight: 800, textDecoration: 'none', flexShrink: 0,
          }}
        >
          +
        </a>
      </div>
      {units.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {units.map((u, i) => (
            <a key={u.id} href={`/dashboard/micro-units/${u.id}`} style={{ color: '#fff', textDecoration: 'none', opacity: 0.9, display: 'flex', gap: 4 }}>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <span>{u.title}</span>
            </a>
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.7, fontStyle: 'italic' }}>No units yet</div>
      )}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', margin: '4px 0' }} />

      <div style={{ fontWeight: 800, fontSize: 12, color: '#b57c2a', letterSpacing: 0.3 }}>
        ✨ GO FURTHER
      </div>
      <div>
        Get the full <strong>TeacherAssist Learning Ecosystem</strong>:
      </div>
      <ul style={{ paddingLeft: 14, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <li>Curriculum mapped automatically, per grade</li>
        <li>Automatic upload to assessment tools for data observation</li>
        <li>Report card generation — all based on each student's individual data</li>
      </ul>
      <a
        href="https://optimizeyourfreedom.com"
        target="_blank"
        rel="noreferrer"
        style={{
          marginTop: 'auto',
          display: 'block',
          textAlign: 'center',
          background: '#b57c2a',
          color: '#fff',
          padding: '8px 6px',
          borderRadius: 6,
          fontWeight: 700,
          textDecoration: 'none',
          fontSize: 11,
        }}
      >
        Learn More
      </a>
    </div>
  );
}


