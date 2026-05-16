import { CustomerTrackingClient } from './CustomerTrackingClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';

export default async function CustomerTrackingPage({ params }: PageProps) {
  const { token } = await params;
  return <CustomerTrackingClient token={token} />;
}

export const metadata = {
  title: 'Live Tracking | Tyre Rescue',
  robots: { index: false, follow: false },
};
