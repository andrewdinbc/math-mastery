'use client'
import { useParams } from 'next/navigation'
import ProgressChart from '@/components/ProgressChart'

const C = { navy: '#1c3557', border: '#ddd4c2' }

// Same QR code as the student uses, but a separate parent-facing route
// and template - the server-side /api/progress/[qrCode] endpoint is what
// actually enforces the student/parent distinction (baseline never
// returned to a student-viewer request no matter what), this page just
// requests the parent view.
export default function ParentViewPage() {
  const { qrCode } = useParams()

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4ee', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ color: C.navy, fontSize: 22, marginBottom: 4 }}>Progress Report</h1>
        <p style={{ fontSize: 13, color: '#8a7d6e', marginBottom: 24 }}>
          What&apos;s shown here — score format, feedback, and start-of-year baseline — is set by your
          child&apos;s teacher.
        </p>

        <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${C.border}`, padding: 20 }}>
          <ProgressChart qrCode={qrCode} viewer="parent" />
        </div>
      </div>
    </div>
  )
}
