import { Stack } from 'expo-router';

export default function InsightsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Insights' }} />
      <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Stack.Screen name="seo" options={{ title: 'SEO' }} />
      <Stack.Screen name="audit" options={{ title: 'Audit' }} />
    </Stack>
  );
}
