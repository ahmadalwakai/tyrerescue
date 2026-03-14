'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import {
  Box,
  VStack,
  Text,
  Heading,
  Input,
  Button,
  Link as ChakraLink,
  Field,
} from '@chakra-ui/react';

import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      // Always show success to prevent email enumeration
      setIsSubmitted(true);
    } catch (err) {
      // Show success anyway
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  }

  if (isSubmitted) {
    return (
      <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.5s')}>
        <VStack gap={6} align="stretch" textAlign="center">
          <Heading size="lg" color={c.text}>Check Your Email</Heading>
          <Text color={c.muted}>
            If an account with that email exists, we have sent a password reset link.
            The link will expire in 1 hour.
          </Text>
          <Text fontSize="sm" color={c.muted}>
            Did not receive the email? Check your spam folder or try again.
          </Text>
          <Button
            variant="outline"
            onClick={() => setIsSubmitted(false)}
          >
            Try Again
          </Button>
          <ChakraLink asChild color={c.accent} fontSize="sm">
            <NextLink href="/login">Back to Sign In</NextLink>
          </ChakraLink>
        </VStack>
      </Box>
    );
  }

  return (
    <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.5s')}>
      <VStack gap={6} align="stretch">
        <Box textAlign="center" style={anim.fadeUp('0.5s', '0.1s')}>
          <Heading size="lg" mb={2} color={c.text}>
            Forgot Password?
          </Heading>
          <Text color={c.muted}>
            Enter your email address and we will send you a link to reset your password.
          </Text>
        </Box>

        <form onSubmit={handleSubmit}>
          <VStack gap={4} align="stretch">
            <Field.Root>
              <Field.Label>Email Address</Field.Label>
              <Input {...inputProps}
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field.Root>

            <Button
              type="submit"
              colorPalette="orange"
              width="full"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </VStack>
        </form>

        <Box textAlign="center">
          <ChakraLink asChild color={c.accent} fontSize="sm">
            <NextLink href="/login">Back to Sign In</NextLink>
          </ChakraLink>
        </Box>
      </VStack>
    </Box>
  );
}
