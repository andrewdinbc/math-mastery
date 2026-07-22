"use client";
// components/MorpheusChat.jsx
// "Ask Morpheus" -- floating assistant, available on every page of this
// product. Deliberately self-contained: calls this product's OWN
// /api/morpheus-chat route (its own ANTHROPIC_API_KEY), not Hyperion's.
// This is intentional: a Hyperion outage (see 2026-07-22 incident) must
// never take down a live, TPT-sold customer-facing product.

import { useState, useRef, useEffect } from "react";

const C = {
  navy:   "#1c3557",
  gold:   "#b57c2a",
  border: "#e3ddd0",
  bg:     "#f7f5f0",
  muted:  "#8a7d6e",
};

async function callMorpheus(userMsg, system, history) {
  const res = await fetch("/api/morpheus-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [...history, { role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.text || data.content?.[0]?.text || data.reply || "";
}

export default function MorpheusChat({ context = "", productName = "this product" }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, open]);

  async function send() {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    setBusy(true);
    const newHistory = [...history, { role: "user", content: msg }];
    setHistory(newHistory);

    const system =
      `You are Morpheus, the built-in assistant for ${productName}, part of the Chalk & Circuit ` +
      "educational suite. Help the teacher using this product directly -- answer questions about " +
      "how to use the tool, their data on screen, and general teaching workflow questions. " +
      "Be direct, specific, and warm. Plain text only -- no markdown symbols.\n" +
      (context ? `\nCurrent page context:\n${context}` : "");

    const plain = history.map(({ role, content }) => ({ role, content }));
    try {
      const reply = await callMorpheus(msg, system, plain);
      setHistory([...newHistory, { role: "assistant", content: reply }]);
    } catch (e) {
      setHistory([...newHistory, { role: "assistant", content: "⚠️ " + (e.message || "Could not get a response.") }]);
    }
    setBusy(false);
  }

  return (
    <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 50 }}>
      {open && (
        <div style={{
          width: 340, maxWidth: "calc(100vw - 32px)", height: 440,
          background: "#fff", borderRadius: 14,
          border: `1px solid ${C.border}`,
          boxShadow: "0 8px 32px rgba(0,0,0,.18)",
          display: "flex", flexDirection: "column",
          marginBottom: 10, overflow: "hidden",
        }}>
          <div style={{ background: C.navy, color: "#fff", padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>🧠 Ask Morpheus</div>
              <div style={{ fontSize: 9, color: "#d9c9a3", letterSpacing: ".5px", marginTop: 1 }}>CHALK & CIRCUIT</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {history.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Ask me anything about {productName} -- how to use a feature, what's on your screen, or general teaching questions.
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? C.navy : C.bg,
                color: m.role === "user" ? "#fff" : "#1a1402",
                borderRadius: 8, padding: "7px 10px",
                fontSize: 12.5, lineHeight: 1.5,
                whiteSpace: "pre-wrap", maxWidth: "88%",
              }}>
                {m.content}
              </div>
            ))}
            {busy && <div style={{ alignSelf: "flex-start", color: C.muted, fontSize: 12 }}>⏳ thinking…</div>}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <input
              style={{ flex: 1, padding: "7px 10px", fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 7, background: C.bg, color: "#1a1402", fontFamily: "inherit", outline: "none" }}
              type="text"
              placeholder="Ask anything…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !busy) send(); }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 7, padding: "7px 13px", fontSize: 13, fontWeight: 700, cursor: busy || !input.trim() ? "not-allowed" : "pointer", opacity: busy || !input.trim() ? 0.5 : 1, fontFamily: "inherit" }}>
              ➤
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 24, padding: "12px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.25)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
        {open ? "✕ Close" : "🧠 Ask Morpheus"}
      </button>
    </div>
  );
}
