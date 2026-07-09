'use client';

// Narrow upsell sidebar, matching the reference CommonCoreSheets-style
// narrow left nav pattern - always visible, pointing toward the Tier 3
// full ecosystem offering (optimizeyourfreedom.com per the TeacherAssist
// 3-tier business model).

export default function UpsellSidebar() {
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
