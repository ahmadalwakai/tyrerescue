import { DriverTrackingClient } from './DriverTrackingClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';

export default async function DriverTrackingPage({ params }: PageProps) {
  const { token } = await params;
  return <DriverTrackingClient token={token} />;
}

export const metadata = {
  title: 'Driver Tracking | Tyre Rescue',
  robots: { index: false, follow: false },
};
