'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
