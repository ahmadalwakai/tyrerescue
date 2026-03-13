'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
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
import { anim } from '@/lib/animations';

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        setIsLoading(false);
        return;
      }

      // Fetch user info to determine role-based redirect
      if (callbackUrl) {
        router.push(callbackUrl);
      } else {
        // Get session to determine role
        const sessionRes = await fetch('/api/auth/session');
        const session = await sessionRes.json();

        if (session?.user?.role === 'admin') {
          router.push('/admin');
        } else if (session?.user?.role === 'driver') {
          router.push('/driver');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  }

  return (
    <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.5s')}>
      <VStack gap={6} align="stretch">
        <Box textAlign="center" style={anim.fadeUp('0.5s', '0.1s')}>
          <Heading size="lg" mb={2} color={c.text}>
            Sign In
          </Heading>
          <Text color={c.muted}>
            Welcome back to Tyre Rescue
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
              <Field.Label>Email Address</Field.Label>
              <Input
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={anim.fadeUp('0.4s', '0.15s')}
              />
            </Field.Root>

            <Field.Root>
              <Field.Label>Password</Field.Label>
              <Input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                style={anim.fadeUp('0.4s', '0.25s')}
              />
            </Field.Root>

            <Box textAlign="right">
              <ChakraLink asChild color={c.accent} fontSize="sm">
                <NextLink href="/forgot-password">Forgot password?</NextLink>
              </ChakraLink>
            </Box>

            <Button
              type="submit"
              colorPalette="orange"
              width="full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </VStack>
        </form>

        <Box textAlign="center">
          <Text fontSize="sm" color={c.muted}>
            Don&apos;t have an account?{' '}
            <ChakraLink asChild color={c.accent} fontWeight="semibold">
              <NextLink href="/register">Create one</NextLink>
            </ChakraLink>
          </Text>
        </Box>
      </VStack>
    </Box>
  );
}
