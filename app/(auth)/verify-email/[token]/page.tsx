'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
  VStack,
  Text,
  Heading,
  Button,
  Link as ChakraLink,
} from '@chakra-ui/react';

import { colorTokens as c } from '@/lib/design-tokens';

type VerificationStatus = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const params = useParams();
  const token = params.token as string;

  const [status, setStatus] = useState<VerificationStatus>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function verifyEmail() {
      try {
        const res = await fetch(`/api/auth/verify-email/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setStatus('error');
          setErrorMessage(data.error || 'Failed to verify email');
          return;
        }

        setStatus('success');
      } catch (err) {
        setStatus('error');
        setErrorMessage('An unexpected error occurred');
      }
    }

    if (token) {
      verifyEmail();
    }
  }, [token]);

  if (status === 'verifying') {
    return (
      <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <VStack gap={6} align="stretch" textAlign="center">
          <Heading size="lg" color={c.text}>Verifying Your Email</Heading>
          <Text color={c.muted}>
            Please wait while we verify your email address...
          </Text>
        </VStack>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <VStack gap={6} align="stretch" textAlign="center">
          <Heading size="lg" color={c.text}>Verification Failed</Heading>
          <Text color={c.muted}>
            {errorMessage}
          </Text>
          <Text fontSize="sm" color={c.muted}>
            The verification link may have expired or already been used.
            Please request a new verification email.
          </Text>
          <Button asChild colorPalette="orange">
            <NextLink href="/login">Go to Sign In</NextLink>
          </Button>
        </VStack>
      </Box>
    );
  }

  return (
    <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border}>
      <VStack gap={6} align="stretch" textAlign="center">
        <Heading size="lg" color={c.text}>Email Verified</Heading>
        <Text color={c.muted}>
          Your email address has been verified successfully.
          You can now sign in to your account.
        </Text>
        <Button asChild colorPalette="orange">
          <NextLink href="/login">Sign In</NextLink>
        </Button>
      </VStack>
    </Box>
  );
}
