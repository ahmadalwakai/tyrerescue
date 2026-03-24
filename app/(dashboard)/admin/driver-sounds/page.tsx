import { Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { DriverSoundsClient } from './DriverSoundsClient';

export default function AdminDriverSoundsPage() {
  return (
    <VStack align="stretch" gap={6}>
      <div>
        <Heading size="lg" color={c.text}>Driver App Sounds</Heading>
        <Text color={c.muted} mt={1}>Control which sounds play in the driver app for each event type.</Text>
      </div>
      <DriverSoundsClient />
    </VStack>
  );
}
