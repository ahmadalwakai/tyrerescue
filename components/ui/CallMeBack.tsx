'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Box, Text, Input, Button, VStack, Flex } from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';

type FormState = 'idle' | 'open' | 'submitting' | 'success' | 'error';

const HIDDEN_PREFIXES = ['/admin', '/dashboard', '/driver'];

export function CallMeBack() {
  const pathname = usePathname();
  const [state, setState] = useState<FormState>('idle');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => {
        setState('idle');
        setName('');
        setPhone('');
        setNotes('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  async function handleSubmit() {
    if (!name.trim() || !phone.trim()) return;
    setState('submitting');
    try {
      const res = await fetch('/api/call-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), notes: notes.trim() || undefined }),
      });
      if (res.ok) {
        setState('success');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }

  if (hidden) return null;

  if (state === 'idle') {
    return (
      <Box
        position="fixed"
        bottom={{ base: '20px', md: '28px' }}
        left={{ base: '20px', md: '28px' }}
        zIndex={1100}
      >
        <Button
          bg={c.accent}
          color="white"
          fontWeight="700"
          fontSize="14px"
          borderRadius="8px"
          px={5}
          py={3}
          minH="44px"
          _hover={{ bg: c.accentHover }}
          onClick={() => setState('open')}
          boxShadow="0 4px 20px rgba(0,0,0,0.3)"
        >
          CALL ME BACK
        </Button>
      </Box>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <Box
        position="fixed"
        inset="0"
        bg="rgba(0,0,0,0.5)"
        zIndex={1200}
        onClick={() => state === 'open' || state === 'error' ? setState('idle') : undefined}
      />

      {/* Form panel */}
      <Box
        position="fixed"
        bottom={{ base: '20px', md: '28px' }}
        left={{ base: '20px', md: '28px' }}
        zIndex={1300}
        bg={c.surface}
        borderRadius="12px"
        borderWidth="1px"
        borderColor={c.border}
        p={6}
        w={{ base: 'calc(100vw - 40px)', md: '360px' }}
        maxW="360px"
        boxShadow="0 8px 32px rgba(0,0,0,0.4)"
      >
        {state === 'success' ? (
          <VStack gap={3} py={4}>
            <Text fontWeight="700" fontSize="lg" color={c.text}>
              We will call you back
            </Text>
            <Text color={c.muted} fontSize="sm" textAlign="center">
              A member of our team will be in touch shortly.
            </Text>
          </VStack>
        ) : state === 'error' ? (
          <VStack gap={3} py={4}>
            <Text fontWeight="700" fontSize="lg" color="#EF4444">
              Something went wrong
            </Text>
            <Text color={c.muted} fontSize="sm" textAlign="center">
              Please try again or call us directly.
            </Text>
            <Button size="sm" bg={c.card} color={c.text} onClick={() => setState('open')}>
              Try Again
            </Button>
          </VStack>
        ) : (
          <VStack gap={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="700" fontSize="lg" color={c.text}>
                Request a Call Back
              </Text>
              <Button
                size="sm"
                variant="ghost"
                color={c.muted}
                onClick={() => setState('idle')}
                minW="auto"
                px={2}
              >
                Close
              </Button>
            </Flex>

            <Box>
              <Text fontSize="13px" color={c.muted} mb="6px" fontWeight="500">Name</Text>
              <Input
                {...inputProps}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Box>

            <Box>
              <Text fontSize="13px" color={c.muted} mb="6px" fontWeight="500">Phone</Text>
              <Input
                {...inputProps}
                placeholder="Your phone number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Box>

            <Box>
              <Text fontSize="13px" color={c.muted} mb="6px" fontWeight="500">Notes (optional)</Text>
              <Input
                {...inputProps}
                placeholder="Brief description"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Box>

            <Button
              bg={c.accent}
              color="white"
              fontWeight="700"
              w="full"
              minH="48px"
              borderRadius="8px"
              _hover={{ bg: c.accentHover }}
              onClick={handleSubmit}
              disabled={!name.trim() || !phone.trim() || state === 'submitting'}
            >
              {state === 'submitting' ? 'Submitting...' : 'SUBMIT'}
            </Button>
          </VStack>
        )}
      </Box>
    </>
  );
}
