"use client";
// DevModePanel.jsx — Chalk & Circuit Developer Mode SDK
// Drop this into any React app to enable governed beta feedback.
// © 2026 Andrew Din / Chalk & Circuit — TRADE SECRET
//
// Usage:
//   import DevModePanel from "./developer-mode/DevModePanel";
//   <DevModePanel
//     productName="TeacherAssist BC"
//     sourceRepo="andrewdinbc/teacherassist-bc"
//     userEmail="teacher@school.ca"
//     userKey="beta_abc123"          ← from your licence system
//     morpheusUrl="https://morpheus-scheduler.vercel.app"
//   />

import { useState, useRef, useEffect } from "react";
import DevModeSandbox from "./DevModeSandbox";

const C = {
  bg:      "#0f1923",
  surface: "#1a2535",
  border:  "#2a3a50",
  accent:  "#f0a500",
  green:   "#22c55e",
  red:     "#ef4444",
  text:    "#e8edf2",
  muted:   "#7a8fa6",
};

const STAGES = {
  CLOSED:       "closed",
  CHAT:         "chat",
  SANDBOX:      "sandbox",
  SUBMIT:       "submit",
  SUBMITTED:    "submitted",
  IMPLEMENTING: "implementing",
  OUTCOME:      "outcome",
};

export default function DevModePanel({
  productName   = "Chalk & Circuit App",
  mode          = "customer",
  sourceRepo    = "",
  userEmail     = "",
  userKey       = "",
  morpheusUrl   = "https://morpheus-scheduler.vercel.app",
  enabled       = true,
  audienceLabel = "a teacher",
}) {
  const [stage,       setStage]       = useState(STAGES.CLOSED);
  const [history,     setHistory]     = useState([]);
  const [input,       setInput]       = useState("");
  const [busy,        setBusy]        = useState(false);
  const [patch,       setPatch]       = useState(null);   // current generated patch
  const [submitNote,  setSubmitNote]  = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [agreed,      setAgreed]      = useState(false);
  const [showTerms,   setShowTerms]   = useState(false);
  const [submissionId, setSubmissionId] = useState(null);
  const [outcome,      setOutcome]      = useState(null); // result of polling dev-submit-status
  const [reverting,    setReverting]    = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, stage]);

  if (!enabled) return null;

  // ── Agreement gate ─────────────────────────────────────────────────────
  function handleOpen() {
    const seen = localStorage.getItem("devmode_agreed_v1");
    if (!seen) { setShowTerms(true); return; }
    // If a personal-mode submission is mid-flight (minimized during
    // Implementing), resume exactly where they left off instead of
    // dropping back to a blank chat.
    if (submissionId && outcome) { setStage(STAGES.OUTCOME); return; }
    if (submissionId && !outcome) { setStage(STAGES.IMPLEMENTING); return; }
    setStage(STAGES.CHAT);
  }

  // Expose so other components on the page (e.g. a "Suggest a Change" tile)
  // can open this panel directly, going through the same terms-gate logic.
  useEffect(() => {
    window.__openDevMode = handleOpen;
    return () => { delete window.__openDevMode; };
  }, []);

  function acceptTerms() {
    localStorage.setItem("devmode_agreed_v1", "1");
    setAgreed(true);
    setShowTerms(false);
    setStage(STAGES.CHAT);
    // Record acceptance server-side, tied to identity - a localStorage flag
    // alone gives the owner no audit trail of who accepted what, when.
    fetch(`${morpheusUrl}/api/dev-terms-accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productName, sourceRepo, userEmail, userKey, termsVersion: "v1" }),
    }).catch(() => { /* non-critical - don't block the user over this */ });
  }

  // ── AI call ────────────────────────────────────────────────────────────
  async function sendMessage() {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput(""); setBusy(true);

    const newHistory = [...history, { role: "user", content: msg }];
    setHistory(newHistory);

    try {
      const system = `You are a developer assistant helping ${audienceLabel} customize ${productName}.
Suggestions and framing should be relevant to ${audienceLabel}'s actual use of this product — do not assume an unrelated audience or context.
The user describes what they want changed in plain English.
Your job:
1. Acknowledge what they want in 1-2 sentences.
2. Ask ONE clarifying question if needed, or proceed directly.
3. When you have enough info, generate a concrete change description wrapped in:
   <PATCH>
   Description: [what changes]
   Files affected: [component names]
   Change: [specific UI/logic change in plain English]
   Ready: true
   </PATCH>
Keep responses conversational and jargon-free.
Never show actual code. Focus on what the change does, not how it works.`;

      const res = await fetch("/api/claude-dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          messages: newHistory.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await res.json();
      let reply;
      if (!res.ok) {
        reply = res.status === 401
          ? "⚠️ Your session expired. Refresh the page and log in again, then try that message once more."
          : `⚠️ Something went wrong (${res.status}): ${data.error || "unknown error"}. Try again in a moment.`;
      } else {
        reply = data.content?.[0]?.text || data.reply || "⚠️ Got an empty response from the AI. Try rephrasing your message.";
      }

      // Extract patch if present. Any complete <PATCH>...</PATCH> block means
      // the AI has finished clarifying and produced a real spec - don't gate
      // showing the implement button on an exact "Ready: true" text match,
      // since minor formatting variance (markdown bold, "Ready: Yes", etc.)
      // shouldn't hide it.
      const patchMatch = reply.match(/<PATCH>([\s\S]*?)<\/PATCH>/);
      let cleanReply;

      if (patchMatch) {
        const patchText = patchMatch[1].trim();
        setPatch(patchText);
        cleanReply = reply.replace(/<PATCH>[\s\S]*?<\/PATCH>/g, "").trim();
      } else if (/<PATCH>/.test(reply)) {
        // Opening tag present but no closing tag - the response got cut off
        // before finishing. Don't show raw markup to the user.
        cleanReply = reply.replace(/<PATCH>[\s\S]*$/, "").trim() +
          "\n\n⚠️ That got cut off partway through. Type \"continue\" and I'll pick up where I left off.";
      } else {
        cleanReply = reply;
      }
      setHistory([...newHistory, { role: "assistant", content: cleanReply }]);

    } catch (e) {
      setHistory([...newHistory, {
        role: "assistant",
        content: "⚠️ Couldn't reach the AI. Check your connection and try again.",
      }]);
    }
    setBusy(false);
  }

  // ── Submit to Morpheus ─────────────────────────────────────────────────
  async function submitForReview(queueOnly = false) {
    if (!patch) return;
    setSubmitting(true);

    // implementNow reflects an explicit in-the-moment choice, not just the
    // app's default mode - a personal-mode app still lets Andrew hit
    // "Queue for Later" for anything he doesn't want interrupting him right
    // now, and dev-submit on the Hyperion side must honour this flag rather
    // than always auto-triggering run-tasks for mode:"personal".
    const implementNow = mode === "personal" && !queueOnly;

    const submission = {
      productName,
      sourceRepo,
      userEmail,
      userKey,
      patch,
      userNote: submitNote.trim(),
      sessionTranscript: history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n"),
      submittedAt: new Date().toISOString(),
      mode,
      implementNow,
    };

    try {
      // Queue as a Morpheus task
      const res = await fetch(`${morpheusUrl}/api/dev-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (implementNow && data.submissionId) {
          setSubmissionId(data.submissionId);
          setStage(STAGES.IMPLEMENTING);
          pollStatus(data.submissionId);
        } else {
          setStage(STAGES.SUBMITTED);
        }
      } else {
        throw new Error(`Submit failed: ${res.status}`);
      }
    } catch (e) {
      alert("Submission failed: " + e.message + "\n\nPlease try again or contact support.");
    }
    setSubmitting(false);
  }

  // ── Poll for implementation outcome (personal mode only) ─────────────────
  async function pollStatus(id) {
    const POLL_INTERVAL_MS = 4000;
    const MAX_POLLS = 45; // ~3 minutes before giving up and asking user to check back later
    let polls = 0;

    const tick = async () => {
      polls++;
      try {
        const res = await fetch(`${morpheusUrl}/api/dev-submit-status?submissionId=${id}`);
        const data = await res.json();

        if (data.outcome === "success" || data.outcome === "failed") {
          setOutcome(data);
          setStage(STAGES.OUTCOME);
          return; // stop polling
        }
        if (polls >= MAX_POLLS) {
          setOutcome({ outcome: "timeout", ...data });
          setStage(STAGES.OUTCOME);
          return;
        }
      } catch {
        // network hiccup - keep trying, don't give up on one failed poll
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  }

  async function handleRevert() {
    if (!outcome?.beforeCommitSha || !sourceRepo) return;
    setReverting(true);
    try {
      const res = await fetch(`${morpheusUrl}/api/dev-revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceRepo, beforeCommitSha: outcome.beforeCommitSha, submissionId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Reverted. The page will refresh once the site rebuilds (usually under a minute).");
        setTimeout(() => window.location.reload(), 45000);
      } else {
        alert("Revert failed: " + (data.error || "unknown error"));
      }
    } catch (e) {
      alert("Revert failed: " + e.message);
    }
    setReverting(false);
  }

  function handleAccept() {
    setStage(STAGES.CLOSED);
    setHistory([]); setPatch(null); setSubmitNote(""); setSubmissionId(null); setOutcome(null);
  }

  function handleModify() {
    setHistory([...history, {
      role: "assistant",
      content: `Your last change is live. What would you like to adjust about it?`,
    }]);
    setStage(STAGES.CHAT);
    setOutcome(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes devmode-pulse-dots {
          0%, 20% { opacity: 0.2; }
          50% { opacity: 1; }
          100% { opacity: 0.2; }
        }
        @keyframes devmode-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .devmode-dot { animation: devmode-pulse-dots 1.4s infinite; display: inline-block; }
        .devmode-dot:nth-child(2) { animation-delay: 0.2s; }
        .devmode-dot:nth-child(3) { animation-delay: 0.4s; }
        .devmode-spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,.3); border-top-color: currentColor;
          border-radius: 50%; animation: devmode-spin 0.8s linear infinite;
        }
      `}</style>
      {/* Terms modal */}
      {showTerms && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:14, padding:28, maxWidth:480, width:"100%" }}>
            <div style={{ fontWeight:800, fontSize:17, marginBottom:12 }}>🔧 Developer Mode — Beta Agreement</div>
            <div style={{ fontSize:13, color:"#444", lineHeight:1.7, marginBottom:16 }}>
              <p>Welcome to <strong>{productName} Developer Mode</strong> — a beta program where your feedback directly shapes the product.</p>
              <p><strong>What you get:</strong> Free or discounted access while Developer Mode is active. A version of the app customized to your needs through conversation.</p>
              <p><strong>What you give:</strong> Feedback and suggested improvements through this panel. {mode === "personal" ? "Changes you submit are implemented directly." : "Your suggestions are reviewed by Andrew Din before any changes are made."}</p>
              <p><strong>Ownership:</strong> All suggestions you submit become feedback only. Andrew Din retains full ownership of {productName} and all derivative code. You will never have access to source code.</p>
              <p><strong>Privacy:</strong> Your session conversations are stored securely and used only for product development. No student data is ever sent through Developer Mode.</p>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowTerms(false)}
                style={{ flex:1, padding:"10px 0", borderRadius:8, border:"1.5px solid #ddd", background:"#fff", color:"#888", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={acceptTerms}
                style={{ flex:2, padding:"10px 0", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>
                I Agree — Enter Developer Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating panel */}
      <div style={{ position:"fixed", bottom:16, left:16, zIndex:1000 }}>

        {stage !== STAGES.CLOSED && (
          <div style={{
            width: stage === STAGES.SANDBOX ? "min(720px, calc(100vw - 32px))" : 360,
            maxWidth: "calc(100vw - 32px)",
            background: C.bg,
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            boxShadow: "0 12px 40px rgba(0,0,0,.5)",
            marginBottom: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 120px)",
          }}>

            {/* Header */}
            <div style={{ background: C.surface, padding: "11px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
              <div>
                <div style={{ color: C.accent, fontWeight:800, fontSize:13, letterSpacing:".3px" }}>
                  🔧 DEVELOPER MODE
                </div>
                <div style={{ color: C.muted, fontSize:10, marginTop:1 }}>{productName} · Beta</div>
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {stage === STAGES.CHAT && patch && (
                  <button onClick={() => setStage(STAGES.SANDBOX)}
                    style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, border:"none", background:C.green, color:"#fff", cursor:"pointer" }}>
                    Preview →
                  </button>
                )}
                {stage === STAGES.SANDBOX && (
                  <button onClick={() => setStage(STAGES.CHAT)}
                    style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, border:`1px solid ${C.border}`, background:"transparent", color:C.muted, cursor:"pointer" }}>
                    ← Chat
                  </button>
                )}
                {(stage === STAGES.CHAT || stage === STAGES.SANDBOX) && patch && (
                  <button onClick={() => setStage(STAGES.SUBMIT)}
                    style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, border:"none", background:C.accent, color:"#fff", cursor:"pointer" }}>
                    Submit →
                  </button>
                )}
                <button onClick={() => setStage(STAGES.CLOSED)}
                  style={{ background:"none", border:"none", color:C.muted, fontSize:18, cursor:"pointer", lineHeight:1, padding:"0 2px" }}>×</button>
              </div>
            </div>

            {/* Chat stage */}
            {stage === STAGES.CHAT && (
              <>
                {/* Sticky ready-to-implement banner - always visible, no scrolling needed */}
                {patch && !busy && (
                  <div style={{ background:"#0f2a1a", borderBottom:`1px solid ${C.green}50`, padding:"10px 14px", flexShrink:0 }}>
                    <div style={{ color:C.green, fontWeight:700, fontSize:12, marginBottom:6 }}>✓ Change ready to implement</div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={() => setStage(STAGES.SANDBOX)}
                        style={{ flex:1, padding:"7px 12px", borderRadius:6, border:"none", background:C.green, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        Preview this change →
                      </button>
                      <button onClick={() => setStage(STAGES.SUBMIT)}
                        style={{ flex:1, padding:"7px 12px", borderRadius:6, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                        Skip to Submit →
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ flex:1, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
                  {history.length === 0 && (
                    <div style={{ color:C.muted, fontSize:13, lineHeight:1.7 }}>
                      <div style={{ color:C.text, fontWeight:700, marginBottom:6 }}>What would you like to change?</div>
                      Describe any change to {productName} in plain English — the wording, layout, a new field, different behaviour. I'll work with you to refine it, then you can submit it for review.
                      <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:6 }}>
                        {[
                          "Add a field for IEP student notes",
                          "Make the font bigger throughout",
                          "Add a French immersion toggle",
                          "Show the proficiency scale as a colour legend",
                        ].map(s => (
                          <button key={s} onClick={() => { setInput(s); }}
                            style={{ textAlign:"left", padding:"7px 10px", borderRadius:7, border:`1px solid ${C.border}`, background:C.surface, color:C.muted, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                            "{s}"
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {history.map((m, i) => (
                    <div key={i} style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      background: m.role === "user" ? "#1e3a5f" : C.surface,
                      color: C.text,
                      borderRadius: 9, padding: "8px 12px",
                      fontSize: 13, lineHeight: 1.55,
                      whiteSpace: "pre-wrap", maxWidth: "88%",
                      border: `1px solid ${m.role === "user" ? "#2a4f7a" : C.border}`,
                    }}>
                      {m.content}
                    </div>
                  ))}
                  {busy && (
                    <div style={{ color:C.muted, fontSize:12, display:"flex", alignItems:"center", gap:6 }}>
                      <span>Thinking</span>
                      <span className="devmode-dot">●</span>
                      <span className="devmode-dot">●</span>
                      <span className="devmode-dot">●</span>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
                <div style={{ display:"flex", gap:6, padding:"10px 12px", borderTop:`1px solid ${C.border}`, flexShrink:0, alignItems:"flex-end" }}>
                  <textarea
                    style={{ flex:1, padding:"8px 11px", fontSize:13, border:`1px solid ${C.border}`, borderRadius:7, background:C.surface, color:C.text, fontFamily:"inherit", outline:"none", resize:"vertical", minHeight:64, lineHeight:1.5, boxSizing:"border-box" }}
                    rows={3}
                    placeholder="Describe what you'd like to change… (Shift+Enter for a new line)"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !busy) { e.preventDefault(); sendMessage(); } }}
                  />
                  <button onClick={sendMessage} disabled={busy || !input.trim()}
                    style={{ padding:"8px 14px", borderRadius:7, border:"none", background:C.accent, color:"#fff", fontSize:14, fontWeight:700, cursor:busy||!input.trim()?"not-allowed":"pointer", opacity:busy||!input.trim()?0.5:1, alignSelf:"flex-end" }}>
                    ➤
                  </button>
                </div>
              </>
            )}

            {/* Sandbox stage */}
            {stage === STAGES.SANDBOX && (
              <DevModeSandbox patch={patch} productName={productName} />
            )}

            {/* Submit stage */}
            {stage === STAGES.SUBMIT && (
              <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14, overflowY:"auto" }}>
                <div style={{ color:C.text, fontWeight:700, fontSize:14 }}>📬 Submit for Review</div>
                <div style={{ color:C.muted, fontSize:13, lineHeight:1.6 }}>
                  {mode === "personal"
                    ? `Choose below: implement right away, or queue it for the next overnight build cycle instead.`
                    : `Your suggested change will be reviewed by Andrew Din, usually within 24 hours. If accepted, it'll be built into ${productName}. You'll get an email when it's reviewed.`}
                </div>
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ color:C.accent, fontSize:11, fontWeight:700, marginBottom:4 }}>YOUR SUGGESTED CHANGE</div>
                  {patch.split("\n").filter(l => l.trim() && !l.includes("Ready:")).map((l,i) => (
                    <div key={i} style={{ color:C.text, fontSize:12, lineHeight:1.5 }}>{l}</div>
                  ))}
                </div>
                <div>
                  <div style={{ color:C.muted, fontSize:12, marginBottom:6 }}>Any additional notes? (optional)</div>
                  <textarea
                    value={submitNote}
                    onChange={e => setSubmitNote(e.target.value)}
                    placeholder="e.g. This would save me 10 minutes per report card session. My students have a mix of IEP and non-IEP needs."
                    style={{ width:"100%", minHeight:72, padding:"9px 11px", borderRadius:7, border:`1px solid ${C.border}`, background:C.surface, color:C.text, fontSize:13, lineHeight:1.5, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }}
                  />
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => setStage(STAGES.CHAT)}
                      style={{ flex:1, padding:"10px 0", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      ← Keep refining
                    </button>
                    {mode === "personal" ? (
                      <button onClick={() => submitForReview(false)} disabled={submitting}
                        style={{ flex:2, padding:"10px 0", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:800, cursor:submitting?"not-allowed":"pointer", opacity:submitting?0.6:1 }}>
                        {submitting ? "Submitting…" : "⚡ Implement Now"}
                      </button>
                    ) : (
                      <button onClick={() => submitForReview(false)} disabled={submitting}
                        style={{ flex:2, padding:"10px 0", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:800, cursor:submitting?"not-allowed":"pointer", opacity:submitting?0.6:1 }}>
                        {submitting ? "Submitting…" : "✓ Submit for Review"}
                      </button>
                    )}
                  </div>
                  {mode === "personal" && (
                    <button onClick={() => submitForReview(true)} disabled={submitting}
                      style={{ padding:"9px 0", borderRadius:8, border:`1px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:12, fontWeight:700, cursor:submitting?"not-allowed":"pointer", opacity:submitting?0.6:1 }}>
                      🕒 Queue for Later (next overnight cycle instead)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Submitted stage */}
            {stage === STAGES.SUBMITTED && (
              <div style={{ padding:24, textAlign:"center" }}>
                <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                <div style={{ color:C.text, fontWeight:800, fontSize:15, marginBottom:8 }}>Submitted!</div>
                <div style={{ color:C.muted, fontSize:13, lineHeight:1.7, marginBottom:20 }}>
                  {mode === "personal"
                    ? <>Queued for the next overnight build cycle - no approval step needed, it'll just run later instead of right now.</>
                    : <>Your suggestion has been sent for review. Andrew will look at it within 24 hours and you'll get an email at <strong style={{ color:C.text }}>{userEmail}</strong> when it's been reviewed.</>}
                </div>
                <button onClick={() => { setStage(STAGES.CHAT); setHistory([]); setPatch(null); setSubmitNote(""); }}
                  style={{ padding:"10px 20px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  Suggest another change
                </button>
              </div>
            )}

            {/* Implementing stage - personal mode only, polling for outcome */}
            {stage === STAGES.IMPLEMENTING && (
              <div style={{ padding:24, textAlign:"center" }}>
                <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}>
                  <div className="devmode-spinner" style={{ color:C.accent, width:32, height:32, borderWidth:3 }} />
                </div>
                <div style={{ color:C.text, fontWeight:800, fontSize:15, marginBottom:8 }}>Implementing…</div>
                <div style={{ color:C.muted, fontSize:13, lineHeight:1.7, marginBottom:16 }}>
                  Your change is being built and deployed. This usually takes 1-3 minutes.
                </div>
                <div style={{ background:"#2a1f0f", border:"1px solid #b57c2a50", borderRadius:8, padding:"8px 12px", marginBottom:16, textAlign:"left" }}>
                  <div style={{ color:"#e0a840", fontSize:12, lineHeight:1.6 }}>
                    ⚠️ You can minimize this and keep using the app. Just don't start a <em>new</em> suggestion until this one finishes - anything you describe in the meantime may be lost or mixed up with this change.
                  </div>
                </div>
                <button onClick={() => setStage(STAGES.CLOSED)}
                  style={{ padding:"10px 20px", borderRadius:8, border:`1.5px solid ${C.border}`, background:"transparent", color:C.muted, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  Minimize and keep using
                </button>
              </div>
            )}

            {/* Outcome stage - personal mode only, after polling resolves */}
            {stage === STAGES.OUTCOME && (
              <div style={{ padding:24, textAlign:"center" }}>
                {outcome?.outcome === "success" && (
                  <>
                    <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                    <div style={{ color:C.text, fontWeight:800, fontSize:15, marginBottom:8 }}>Change is live!</div>
                    <div style={{ color:C.muted, fontSize:13, lineHeight:1.7, marginBottom:20 }}>
                      Refresh the page to see it. What would you like to do?
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      <button onClick={() => window.location.reload()}
                        style={{ padding:"10px 0", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:800, cursor:"pointer" }}>
                        🔄 Refresh to see changes
                      </button>
                      <button onClick={handleAccept}
                        style={{ padding:"10px 0", borderRadius:8, border:`1.5px solid ${C.accent}`, background:"#fff", color:C.accent, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                        ✓ Accept the changes
                      </button>
                      <button onClick={handleModify}
                        style={{ padding:"10px 0", borderRadius:8, border:`1px solid ${C.border}`, background:"#fff", color:C.text, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                        ✏️ Modify the changes
                      </button>
                      {outcome?.beforeCommitSha && (
                        <button onClick={handleRevert} disabled={reverting}
                          style={{ padding:"10px 0", borderRadius:8, border:"1px solid #c0392b", background:"#fff", color:"#c0392b", fontSize:13, fontWeight:700, cursor:reverting?"not-allowed":"pointer", opacity:reverting?0.6:1 }}>
                          {reverting ? "Reverting…" : "↩ Revert back to before the changes"}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {outcome?.outcome === "failed" && (
                  <>
                    <div style={{ fontSize:36, marginBottom:12 }}>⚠️</div>
                    <div style={{ color:C.text, fontWeight:800, fontSize:15, marginBottom:8 }}>Implementation failed</div>
                    <div style={{ color:C.muted, fontSize:13, lineHeight:1.7, marginBottom:20 }}>
                      {outcome.error || "Something went wrong building this change."} No changes were made to the live app.
                    </div>
                    <button onClick={handleModify}
                      style={{ padding:"10px 20px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Try describing it differently
                    </button>
                  </>
                )}
                {outcome?.outcome === "timeout" && (
                  <>
                    <div style={{ fontSize:36, marginBottom:12 }}>⏱️</div>
                    <div style={{ color:C.text, fontWeight:800, fontSize:15, marginBottom:8 }}>Still working on it</div>
                    <div style={{ color:C.muted, fontSize:13, lineHeight:1.7, marginBottom:20 }}>
                      This is taking longer than usual. It's still processing - check back in a few minutes, or refresh the page later to see if it's done.
                    </div>
                    <button onClick={() => { setStage(STAGES.IMPLEMENTING); pollStatus(submissionId); }}
                      style={{ padding:"10px 20px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Keep checking
                    </button>
                  </>
                )}
              </div>
            )}

          </div>
        )}

        {/* Toggle button */}
        {stage === STAGES.CLOSED && (
          <button onClick={handleOpen}
            style={{
              background: C.bg, color: C.accent,
              border: `1.5px solid ${C.accent}60`,
              borderRadius: 24, padding: "10px 18px",
              fontSize: 12, fontWeight: 800, cursor: "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
              fontFamily: "inherit", letterSpacing: ".3px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
            🔧 DEVELOPER MODE
          </button>
        )}
      </div>
    </>
  );
}






