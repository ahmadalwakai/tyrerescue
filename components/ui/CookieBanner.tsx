'use client';

import { useState, useEffect } from 'react';
import { Box, Flex, Text, Button } from '@chakra-ui/react';
import Link from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

const COOKIE_KEY = 'tyrerescue_cookie_consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY);
    if (!consent) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem(COOKIE_KEY, 'accepted');
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(COOKIE_KEY, 'declined');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <Box
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex={100}
      bg={c.surface}
      borderTopWidth="1px"
      borderColor={c.border}
      px={6}
      py={4}
    >
      <Flex
        maxW="7xl"
        mx="auto"
        align="center"
        justify="space-between"
        gap={4}
        flexDir={{ base: 'column', md: 'row' }}
      >
        <Text color={c.muted} fontSize="sm" style={{ fontFamily: 'var(--font-body)' }}>
          We use essential cookies to make this site work. By continuing you agree to our{' '}
          <Link href="/cookie-policy" style={{ color: c.accent, textDecoration: 'underline' }}>
            cookie policy
          </Link>
          .
        </Text>
        <Flex gap={3} flexShrink={0}>
          <Button
            size="sm"
            bg={c.card}
            color={c.text}
            borderWidth="1px"
            borderColor={c.border}
            _hover={{ bg: c.border }}
            onClick={decline}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Decline
          </Button>
          <Button
            size="sm"
            bg={c.accent}
            color="white"
            _hover={{ bg: c.accentHover }}
            onClick={accept}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Accept
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
