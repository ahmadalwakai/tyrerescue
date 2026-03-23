import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Download Driver App | Tyre Rescue',
  description:
    'Download the Tyre Rescue Driver app for Android. Accept jobs, navigate to customers, and manage your tyre fitting schedule on the go.',
  robots: { index: false, follow: false },
};

export default function DriverDownloadPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#09090B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Logo / Icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: '#F97316',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: 40,
          }}
        >
          🛞
        </div>

        <h1
          style={{
            color: '#FAFAFA',
            fontSize: '1.75rem',
            fontWeight: 700,
            margin: '0 0 0.5rem',
          }}
        >
          Tyre Rescue Driver
        </h1>

        <p
          style={{
            color: '#A1A1AA',
            fontSize: '1rem',
            lineHeight: 1.6,
            margin: '0 0 2rem',
          }}
        >
          Accept jobs, navigate to customers, and manage your tyre fitting
          schedule — all from your phone.
        </p>

        <a
          href="/tyre-rescue-driver.apk"
          download
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: '#F97316',
            color: '#FAFAFA',
            padding: '0.875rem 2rem',
            borderRadius: 12,
            fontSize: '1.125rem',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 0.2s',
          }}
        >
          ⬇ Download APK
        </a>

        <p
          style={{
            color: '#71717A',
            fontSize: '0.8125rem',
            marginTop: '1rem',
          }}
        >
          Android only · v1.0.0 · ~91 MB
        </p>

        <div
          style={{
            marginTop: '2.5rem',
            padding: '1.25rem',
            background: '#18181B',
            borderRadius: 12,
            border: '1px solid #3F3F46',
            textAlign: 'left',
          }}
        >
          <p
            style={{
              color: '#A1A1AA',
              fontSize: '0.875rem',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: '#FAFAFA' }}>Installation:</strong> After
            downloading, open the APK file on your Android device. You may need
            to enable{' '}
            <em>&quot;Install from unknown sources&quot;</em> in your
            device settings.
          </p>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <Link
            href="/"
            style={{
              color: '#F97316',
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            ← Back to tyrerescue.uk
          </Link>
        </div>
      </div>
    </main>
  );
}
