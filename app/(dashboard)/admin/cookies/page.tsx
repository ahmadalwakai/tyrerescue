import { Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { CookieSettingsClient } from './CookieSettingsClient';

export default function AdminCookiesPage() {
  return (
    <VStack align="stretch" gap={6}>
      <div>
        <Heading size="lg" color={c.text}>Cookie &amp; Analytics Settings</Heading>
        <Text color={c.muted} mt={1}>Manage analytics tracking and cookie banner content.</Text>
      </div>
      <CookieSettingsClient />
    </VStack>
  );
}
