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

import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    urlError === 'AccessDenied'
      ? 'Google sign-in is for customers only. Drivers and admins must use email & password.'
      : ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

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

            <button
              type="button"
              disabled={isGoogleLoading}
              onClick={() => {
                setIsGoogleLoading(true);
                signIn('google', { callbackUrl: callbackUrl || '/dashboard' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 16px',
                borderRadius: '6px',
                border: `1px solid ${c.border}`,
                background: c.surface,
                color: c.text,
                fontSize: '15px',
                fontWeight: 500,
                cursor: isGoogleLoading ? 'not-allowed' : 'pointer',
                opacity: isGoogleLoading ? 0.6 : 1,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {isGoogleLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <Text fontSize="xs" color={c.muted} textAlign="center">
              For customers only. Drivers &amp; admins use email &amp; password.
            </Text>

            <Box style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Box style={{ flex: 1, height: '1px', background: c.border }} />
              <Text fontSize="xs" color={c.muted}>or sign in with email</Text>
              <Box style={{ flex: 1, height: '1px', background: c.border }} />
            </Box>

            <Field.Root>
              <Field.Label>Email Address</Field.Label>
              <Input {...inputProps}
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
              <Input {...inputProps}
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
