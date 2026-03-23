import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download Driver App | Tyre Rescue',
  description:
    'Download the Tyre Rescue Driver app for Android. Get real-time job notifications, GPS tracking, and manage your mobile tyre fitting jobs on the go.',
  robots: { index: false, follow: false },
};

const features = [
  {
    icon: '🔔',
    title: 'Instant Job Alerts',
    description:
      'Receive push notifications the moment a new job is assigned to you. Never miss an assignment.',
  },
  {
    icon: '📍',
    title: 'Background GPS Tracking',
    description:
      'Customers can track your arrival in real time. Location sharing works even when the app is in the background.',
  },
  {
    icon: '🔧',
    title: 'Job Management',
    description:
      'Accept or reject jobs, update your status (en route, arrived, in progress, completed) with one tap.',
  },
  {
    icon: '�️',
    title: 'Live Map & Navigation',
    description:
      'View customer locations on a live map with ETA and distance. One-tap Google Maps navigation.',
  },
  {
    icon: '💬',
    title: 'In-App Chat',
    description:
      'Message customers and admins directly within the app. Get notified of new messages instantly.',
  },
  {
    icon: '�🔒',
    title: 'Secure & Offline-Ready',
    description:
      'Your credentials are stored securely on-device. Core features work even with intermittent connectivity.',
  },
];

const steps = [
  {
    number: 1,
    title: 'Request Access',
    description:
      'Contact the admin team to receive the latest APK file for your device.',
  },
  {
    number: 2,
    title: 'Allow Installation',
    description:
      'When prompted, allow your browser to install apps from this source. Go to Settings → Security → Install Unknown Apps if needed.',
  },
  {
    number: 3,
    title: 'Install & Open',
    description:
      'Open the downloaded .apk file and tap Install. Once installed, open Tyre Rescue Driver.',
  },
  {
    number: 4,
    title: 'Log In',
    description:
      'Sign in with the driver account credentials provided to you by the admin team.',
  },
  {
    number: 5,
    title: 'Grant Permissions',
    description:
      "Allow location (including 'Always') and notification permissions when prompted. Location is required for job tracking.",
  },
];

export default function DriverAppPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/20 via-transparent to-transparent" />
        <div className="container relative mx-auto max-w-4xl px-4 py-16 sm:py-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-400">
            📱 Android App
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Tyre Rescue <span className="text-orange-500">Driver</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
            The official Android app for Tyre Rescue drivers. Manage jobs,
            share your live location with customers, and receive instant push
            notifications — all from your pocket.
          </p>

          {/* Download button */}
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="mailto:support@tyrerescue.uk?subject=Driver%20App%20Access%20Request"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-orange-600/25 transition hover:bg-orange-500 active:scale-95"
            >
              📧 Request Access
            </a>
            <span className="text-sm text-zinc-500">Android 8+ · APK distributed by admin team</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto max-w-5xl px-4 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">
          Built for Drivers
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
            >
              <span className="mb-3 block text-3xl">{f.icon}</span>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Install Steps */}
      <section className="border-t border-zinc-800 bg-zinc-900/50">
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">
            How to Install
          </h2>
          <ol className="space-y-6">
            {steps.map((s) => (
              <li key={s.number} className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-lg font-bold">
                  {s.number}
                </div>
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{s.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Requirements */}
      <section className="border-t border-zinc-800">
        <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="mb-6 text-2xl font-bold sm:text-3xl">
            Requirements
          </h2>
          <div className="mx-auto grid max-w-md gap-4 text-left text-sm text-zinc-400">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span>Android 8.0 (Oreo) or higher</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span>GPS / Location services enabled</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span>Active internet connection (mobile data or Wi-Fi)</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-green-500">✓</span>
              <span>Driver account credentials (provided by Tyre Rescue)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Support */}
      <section className="border-t border-zinc-800 bg-zinc-900/50">
        <div className="container mx-auto max-w-3xl px-4 py-12 text-center">
          <p className="text-zinc-400">
            Having trouble?{' '}
            <a
              href="tel:01412660690"
              className="font-medium text-orange-500 underline-offset-4 hover:underline"
            >
              Call 0141 266 0690
            </a>{' '}
            or email{' '}
            <a
              href="mailto:support@tyrerescue.uk"
              className="font-medium text-orange-500 underline-offset-4 hover:underline"
            >
              support@tyrerescue.uk
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
