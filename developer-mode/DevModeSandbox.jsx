"use client";
// DevModeSandbox.jsx — Live preview sandbox for Developer Mode
// Renders a description of the proposed change visually.
// © 2026 Andrew Din / Chalk & Circuit — TRADE SECRET

import { useState } from "react";

const C = {
  bg:      "#0f1923",
  surface: "#1a2535",
  border:  "#2a3a50",
  accent:  "#f0a500",
  green:   "#22c55e",
  text:    "#e8edf2",
  muted:   "#7a8fa6",
};

export default function DevModeSandbox({ patch, productName }) {
  const [feedback, setFeedback] = useState("");
  const [notes, setNotes]       = useState([]);

  function addNote() {
    if (!feedback.trim()) return;
    setNotes(prev => [...prev, { text: feedback.trim(), ts: new Date().toLocaleTimeString() }]);
    setFeedback("");
  }

  // Parse the patch description into display items
  const lines = (patch || "").split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.includes("Ready:"));

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, overflowY:"auto" }}>

      {/* Sandbox header */}
      <div style={{ background:"#0a1520", padding:"8px 14px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ color:C.muted, fontSize:10, fontWeight:700, letterSpacing:".6px", textTransform:"uppercase" }}>
          Preview · {productName}
        </div>
        <div style={{ color:"#4a9eff", fontSize:11, marginTop:2 }}>
          This shows what your suggested change will look like — not the live app.
        </div>
      </div>

      {/* Change summary */}
      <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ color:C.accent, fontWeight:700, fontSize:12, marginBottom:8 }}>PROPOSED CHANGE</div>
        {lines.map((line, i) => {
          const [label, ...rest] = line.split(":");
          const value = rest.join(":").trim();
          return value ? (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:5 }}>
              <span style={{ color:C.muted, fontSize:12, minWidth:110, flexShrink:0 }}>{label}:</span>
              <span style={{ color:C.text, fontSize:12, lineHeight:1.5 }}>{value}</span>
            </div>
          ) : (
            <div key={i} style={{ color:C.text, fontSize:12, lineHeight:1.5, marginBottom:4 }}>{line}</div>
          );
        })}
      </div>

      {/* Visual mock of the change */}
      <div style={{ padding:"14px 16px", flex:1 }}>
        <div style={{ color:C.accent, fontWeight:700, fontSize:12, marginBottom:10 }}>HOW IT WOULD LOOK</div>
        <div style={{ background:"#fff", borderRadius:8, padding:16, border:`1px solid ${C.border}` }}>
          <div style={{ fontFamily:"sans-serif", fontSize:12, color:"#1a1402" }}>
            {/* Generic visual representation of the change */}
            <div style={{ background:"#f0f4ff", border:"1.5px dashed #4a9eff", borderRadius:6, padding:"10px 14px", marginBottom:10, position:"relative" }}>
              <div style={{ position:"absolute", top:-9, left:10, background:"#4a9eff", color:"#fff", fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:99 }}>NEW</div>
              <div style={{ fontWeight:700, fontSize:13, color:"#1a3a6b", marginBottom:4 }}>
                {lines.find(l => l.toLowerCase().includes("description:"))?.replace(/description:/i,"").trim()
                  || lines[0]?.replace(/[^:]+:/,"").trim()
                  || "Your requested change appears here"}
              </div>
              <div style={{ fontSize:11, color:"#555" }}>
                This element will be added/modified as described above.
              </div>
            </div>
            <div style={{ color:"#888", fontSize:11, fontStyle:"italic" }}>
              ↑ Tap above to see how it integrates with the rest of the page.
              The exact visual will be refined by the developer during implementation.
            </div>
          </div>
        </div>
      </div>

      {/* Feedback notes */}
      <div style={{ padding:"12px 16px", borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ color:C.muted, fontSize:11, marginBottom:6 }}>Add a note about this preview (saved with your submission):</div>
        {notes.length > 0 && (
          <div style={{ marginBottom:8, display:"flex", flexDirection:"column", gap:4 }}>
            {notes.map((n,i) => (
              <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 9px", fontSize:11, color:C.text }}>
                <span style={{ color:C.muted, marginRight:6 }}>{n.ts}</span>{n.text}
              </div>
            ))}
          </div>
        )}
        <div style={{ display:"flex", gap:6 }}>
          <input
            style={{ flex:1, padding:"6px 10px", fontSize:12, border:`1px solid ${C.border}`, borderRadius:6, background:C.surface, color:C.text, fontFamily:"inherit" }}
            placeholder="e.g. The label should say 'Learning Support' not 'IEP'"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addNote(); }}
          />
          <button onClick={addNote} disabled={!feedback.trim()}
            style={{ padding:"6px 12px", borderRadius:6, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
            + Note
          </button>
        </div>
      </div>
    </div>
  );
}

