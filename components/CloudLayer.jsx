'use client'
// components/CloudLayer.jsx
// More visible/opaque decorative clouds than the earlier CloudBackground
// pass -- per Aj's feedback, these need to read clearly IN the gaps
// between widget rows, not just faintly at the page edges. Absolute
// (not fixed) so it scrolls with content and can be placed inside the
// main content column, sitting behind the widget grid via z-index.

function Cloud({ top, left, right, size = 1, opacity = 0.85 }) {
  return (
    <svg
      width={140 * size} height={82 * size} viewBox="0 0 140 82"
      style={{ position: 'absolute', top, left, right, opacity, filter: 'drop-shadow(0 2px 6px rgba(124,92,252,0.06))' }}
    >
      <ellipse cx="35" cy="52" rx="33" ry="23" fill="#fff" />
      <ellipse cx="70" cy="36" rx="40" ry="30" fill="#fff" />
      <ellipse cx="108" cy="52" rx="30" ry="21" fill="#fff" />
    </svg>
  )
}

export default function CloudLayer() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'visible', zIndex: 0, pointerEvents: 'none' }}>
      <Cloud top="90px" left="-30px" size={0.9} opacity={0.9} />
      <Cloud top="340px" right="-20px" size={1.1} opacity={0.85} />
      <Cloud top="620px" left="20%" size={0.7} opacity={0.75} />
      <Cloud top="880px" right="10%" size={0.95} opacity={0.8} />
      <Cloud top="1150px" left="-10px" size={0.8} opacity={0.7} />
    </div>
  )
}
