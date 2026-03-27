import { Stack } from 'expo-router';

export default function CmsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Content CMS' }} />
      <Stack.Screen name="content" options={{ title: 'Pricing Rules' }} />
      <Stack.Screen name="faq" options={{ title: 'FAQ' }} />
      <Stack.Screen name="testimonials" options={{ title: 'Testimonials' }} />
    </Stack>
  );
}
