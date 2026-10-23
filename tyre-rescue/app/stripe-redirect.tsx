import { Redirect } from 'expo-router';

// Fallback for direct navigation. Native bank callbacks normally leave the mounted
// booking in place through +native-intent; a cold start restores its secure draft.
export default function StripeRedirect() {
  return <Redirect href="/" />;
}
