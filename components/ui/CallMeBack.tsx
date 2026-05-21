'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Box, Text, Input, Button, VStack, Flex } from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { trackCallbackSubmit } from '@/lib/analytics/gtag';
import { HONEYPOT_FIELD } from '@/lib/security/honeypot';

type FormState = 'idle' | 'open' | 'submitting' | 'success' | 'error';

const HIDDEN_PREFIXES = ['/admin', '/dashboard', '/driver'];

// Custom event name for opening the call me back form from anywhere (e.g., Nav)
export const CALL_ME_BACK_OPEN_EVENT = 'callMeBackOpen';

export function CallMeBack() {
  const pathname = usePathname();
  const [state, setState] = useState<FormState>('idle');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  // Honeypot — must remain empty. Real users never see/focus this field.
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Listen for external open events (e.g., from Nav button)
  useEffect(() => {
    const handleOpenEvent = () => setState('open');
    window.addEventListener(CALL_ME_BACK_OPEN_EVENT, handleOpenEvent);
    return () => window.removeEventListener(CALL_ME_BACK_OPEN_EVENT, handleOpenEvent);
  }, []);

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
    setErrorMessage(null);
    try {
      const res = await fetch('/api/call-back', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          notes: notes.trim() || undefined,
          [HONEYPOT_FIELD]: companyWebsite,
        }),
      });
      if (res.ok) {
        trackCallbackSubmit();
        setState('success');
      } else {
        let friendly = 'Something went wrong. Please try again.';
        try {
          const data = await res.json();
          if (res.status === 429) {
            friendly = typeof data?.error === 'string'
              ? data.error
              : 'Too many attempts. Please try again shortly.';
          } else if (data?.code === 'SUSPICIOUS_SUBMISSION') {
            friendly = 'We could not process this request. Please try again.';
          } else if (typeof data?.error === 'string') {
            friendly = data.error;
          }
        } catch {
          // Ignore JSON parse errors — fall through to generic message.
        }
        setErrorMessage(friendly);
        setState('error');
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.');
      setState('error');
    }
  }

  if (hidden) return null;

  // No floating button - form is triggered via nav button (CALL_ME_BACK_OPEN_EVENT)
  if (state === 'idle') {
    return null;
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
              {errorMessage ?? 'Please try again or call us directly.'}
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

            {/* Honeypot: visually hidden, off the tab order, not labelled for users. */}
            <Box
              aria-hidden="true"
              position="absolute"
              left="-10000px"
              top="auto"
              width="1px"
              height="1px"
              overflow="hidden"
              pointerEvents="none"
            >
              <Input
                type="text"
                name="companyWebsite"
                tabIndex={-1}
                autoComplete="off"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
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
