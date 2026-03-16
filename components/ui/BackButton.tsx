'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

export function BackButton() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      color={c.muted}
      fontWeight="400"
      px={2}
      _hover={{ color: c.text, bg: 'transparent' }}
      onClick={() => router.back()}
    >
      ← Back
    </Button>
  );
}
