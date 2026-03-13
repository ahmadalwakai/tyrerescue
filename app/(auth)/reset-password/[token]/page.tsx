'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

import { colorTokens as c } from '@/lib/design-tokens';

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border}>
        <VStack gap={6} align="stretch" textAlign="center">
          <Heading size="lg" color={c.text}>Password Reset Complete</Heading>
          <Text color={c.muted}>
            Your password has been reset successfully.
            You can now sign in with your new password.
          </Text>
          <Button asChild colorPalette="orange">
            <NextLink href="/login">Sign In</NextLink>
          </Button>
        </VStack>
      </Box>
    );
  }

  return (
    <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border}>
      <VStack gap={6} align="stretch">
        <Box textAlign="center">
          <Heading size="lg" mb={2} color={c.text}>
            Reset Your Password
          </Heading>
          <Text color={c.muted}>
            Enter your new password below.
          </Text>
        </Box>

        <form onSubmit={handleSubmit}>
          <VStack gap={4} align="stretch">
            {error && (
              <Box bg="rgba(239,68,68,0.1)" p={3} borderRadius="md">
                <Text color="red.400" fontSize="sm">
                  {error}
                </Text>
              </Box>
            )}

            <Field.Root>
              <Field.Label>New Password</Field.Label>
              <Input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
              <Text fontSize="xs" color={c.muted} mt={1}>
                Must contain uppercase, lowercase, and a number
              </Text>
            </Field.Root>

            <Field.Root>
              <Field.Label>Confirm New Password</Field.Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                required
              />
            </Field.Root>

            <Button
              type="submit"
              colorPalette="orange"
              width="full"
              disabled={isLoading}
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
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
