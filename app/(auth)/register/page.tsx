'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Client-side validation
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone: phone || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create account');
        setIsLoading(false);
        return;
      }

      // Redirect to login with success message
      router.push('/login?registered=true');
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
            Create Account
          </Heading>
          <Text color={c.muted}>
            Join Tyre Rescue for 24/7 mobile tyre fitting
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
                signIn('google', { callbackUrl: '/dashboard' });
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
              {isGoogleLoading ? 'Redirecting…' : 'Sign up with Google'}
            </button>

            <Text fontSize="xs" color={c.muted} textAlign="center">
              Instant sign-up. No password needed.
            </Text>

            <Box style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Box style={{ flex: 1, height: '1px', background: c.border }} />
              <Text fontSize="xs" color={c.muted}>or sign up with email</Text>
              <Box style={{ flex: 1, height: '1px', background: c.border }} />
            </Box>

            <Field.Root>
              <Field.Label>Full Name</Field.Label>
              <Input {...inputProps}
                type="text"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="John Smith"
                required
              />
            </Field.Root>

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

            <Field.Root>
              <Field.Label>
                Phone Number
                <Text as="span" color={c.muted} fontWeight="normal" ml={1}>
                  (optional)
                </Text>
              </Field.Label>
              <Input {...inputProps}
                type="tel"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                placeholder="07700 900000"
              />
            </Field.Root>

            <Field.Root>
              <Field.Label>Password</Field.Label>
              <Input {...inputProps}
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
              <Text fontSize="xs" color={c.muted} mt={1}>
                At least 8 characters with uppercase, lowercase, and a number
              </Text>
            </Field.Root>

            <Field.Root>
              <Field.Label>Confirm Password</Field.Label>
              <Input {...inputProps}
                type="password"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
              />
            </Field.Root>

            <Button
              type="submit"
              colorPalette="orange"
              width="full"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>

            <Text fontSize="xs" color={c.muted} textAlign="center">
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </Text>
          </VStack>
        </form>

        <Box textAlign="center">
          <Text fontSize="sm" color={c.muted}>
            Already have an account?{' '}
            <ChakraLink asChild color={c.accent} fontWeight="semibold">
              <NextLink href="/login">Sign in</NextLink>
            </ChakraLink>
          </Text>
        </Box>
      </VStack>
    </Box>
  );
}
