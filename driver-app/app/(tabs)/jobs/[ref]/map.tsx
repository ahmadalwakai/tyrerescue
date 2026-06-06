/**
 * Legacy job map route.
 *
 * Historically this screen rendered a placeholder "Tap to navigate" card that
 * deep-linked straight out to external Google Maps, creating two competing map
 * experiences and dropping the driver onto a grey placeholder.
 *
 * The real, in-app Mapbox navigation cockpit lives at
 * `app/(tabs)/jobs/[ref]/route.tsx`. To guarantee there is exactly ONE map
 * experience, this route now redirects to the cockpit. The expo-router path is
 * preserved (no route removed) so any existing deep links keep working.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';

export default function JobMapRedirect() {
  const { ref } = useLocalSearchParams<{ ref: string }>();

  // Without a ref there is nothing to navigate to — bounce back to the list.
  if (!ref) {
    return <Redirect href="/(tabs)/jobs" />;
  }

  // Brief loading frame avoids a flash before the redirect resolves.
  return (
    <>
      <LoadingScreen />
      <Redirect href={`/(tabs)/jobs/${ref}/route`} />
    </>
  );
}
