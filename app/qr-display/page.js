'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/';

export default function QRDisplayPage() {
  return (
    <Suspense fallback={null}>
      <QRDisplayContent />
    </Suspense>
  );
}

function QRDisplayContent() {
  const params = useSearchParams();
  const url = params.get('url');
  const label = params.get('label') || 'Scan to start';

  if (!url) return <main style={{ padding: 32 }}>No QR target provided.</main>;

  const qrSrc = `${QR_API}?size=600x600&data=${encodeURIComponent(url)}`;

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: '#f2ede3', padding: 32,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1c3557', marginBottom: 20 }}>{label}</div>
      <img src={qrSrc} alt="QR code" style={{ width: '80vmin', height: '80vmin', maxWidth: 600, maxHeight: 600 }} />
    </main>
  );
}
