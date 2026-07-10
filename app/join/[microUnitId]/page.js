'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import jsQR from 'jsqr';

// One shared link for the whole class, meant to be opened full-screen on a
// classroom device (TV/computer). Two ways for a student to identify
// themselves:
//   1. Scan their personal QR code (camera) - always works, no setup needed,
//      the QR already encodes their full practice URL.
//   2. Type their first name - only works if the TEACHER has loaded the
//      local roster file on THIS device first (kept in memory only, never
//      sent anywhere) - matches the zero-cloud-name design, since the
//      server genuinely has no name-to-QR mapping to look up.

export default function JoinPage() {
  const { microUnitId } = useParams();
  const router = useRouter();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [mode, setMode] = useState('choose'); // choose, scanning, nameEntry
  const [scanError, setScanError] = useState('');
  const [roster, setRoster] = useState(null); // {firstName: qrCode} - loaded locally by teacher, this device only
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startScanning() {
    setScanError('');
    setMode('scanning');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      requestAnimationFrame(tick);
    } catch (err) {
      setScanError('Could not access the camera: ' + err.message);
    }
  }

  function tick() {
    if (!streamRef.current || !videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      if (streamRef.current) requestAnimationFrame(tick);
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      stopCamera();
      // The QR already encodes the full practice URL - just go there.
      window.location.href = code.data;
      return;
    }
    requestAnimationFrame(tick);
  }

  function handleLoadRoster(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = reader.result.trim().split('\n').slice(1);
      const map = {};
      lines.forEach((line) => {
        const [qrCode, firstName] = line.split(',');
        if (qrCode && firstName) map[firstName.trim().toLowerCase()] = qrCode.trim();
      });
      setRoster(map);
    };
    reader.readAsText(file);
  }

  function handleNameSubmit(e) {
    e.preventDefault();
    setNameError('');
    const qrCode = roster?.[nameInput.trim().toLowerCase()];
    if (!qrCode) {
      setNameError("Couldn't find that name - check spelling, or scan your QR code instead.");
      return;
    }
    // Redirect to the join-by-qr-code resolver, which turns a qr_code back
    // into the real practice URL (public, no auth - same pattern as the
    // scan path, just resolving from a code instead of decoding an image).
    router.push(`/join/${microUnitId}/by-code?qr=${encodeURIComponent(qrCode)}`);
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#1c3557', color: '#fff', padding: 32,
    }}>
      {mode === 'choose' && (
        <div style={{ textAlign: 'center', maxWidth: 500 }}>
          <h1 style={{ fontSize: 32, marginBottom: 32 }}>Welcome! How do you want to start?</h1>
          <button
            onClick={startScanning}
            style={{ display: 'block', width: '100%', padding: 24, fontSize: 22, background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 12, marginBottom: 16, cursor: 'pointer' }}
          >
            📷 Scan My QR Code
          </button>
          <button
            onClick={() => setMode('nameEntry')}
            style={{ display: 'block', width: '100%', padding: 24, fontSize: 22, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12, cursor: 'pointer' }}
          >
            ⌨️ Type My First Name
          </button>
        </div>
      )}

      {mode === 'scanning' && (
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>Hold your QR code up to the camera</h2>
          <video ref={videoRef} playsInline muted style={{ width: '90vw', maxWidth: 500, borderRadius: 12 }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {scanError && <div style={{ color: '#ff8080', marginTop: 12 }}>{scanError}</div>}
          <button onClick={() => { stopCamera(); setMode('choose'); }} style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8 }}>
            Back
          </button>
        </div>
      )}

      {mode === 'nameEntry' && (
        <div style={{ textAlign: 'center', maxWidth: 400, width: '100%' }}>
          {!roster ? (
            <>
              <h2 style={{ marginBottom: 12 }}>Teacher setup needed first</h2>
              <p style={{ opacity: 0.85, marginBottom: 16 }}>
                Load this class's roster file on this device (once) so students can find themselves by first name. Never sent anywhere - stays in this browser only.
              </p>
              <input type="file" accept=".csv" onChange={handleLoadRoster} style={{ color: '#fff' }} />
            </>
          ) : (
            <form onSubmit={handleNameSubmit}>
              <h2 style={{ marginBottom: 16 }}>What's your first name?</h2>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                autoFocus
                style={{ width: '100%', padding: 16, fontSize: 20, borderRadius: 8, border: 'none', marginBottom: 12, boxSizing: 'border-box' }}
              />
              <button type="submit" style={{ width: '100%', padding: 16, fontSize: 18, background: '#b57c2a', color: '#fff', border: 'none', borderRadius: 8 }}>
                Go
              </button>
              {nameError && <div style={{ color: '#ff8080', marginTop: 12 }}>{nameError}</div>}
            </form>
          )}
          <button onClick={() => setMode('choose')} style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8 }}>
            Back
          </button>
        </div>
      )}
    </main>
  );
}
