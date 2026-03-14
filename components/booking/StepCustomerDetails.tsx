'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Checkbox,
  Fieldset,
  Field,
  Spinner,
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react';
import { WizardState } from './types';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface StepCustomerDetailsProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function StepCustomerDetails({
  state,
  updateState,
  goToNext,
  goToPrev,
}: StepCustomerDetailsProps) {
  const { data: session } = useSession();
  
  const [name, setName] = useState(state.customerName || '');
  const [email, setEmail] = useState(state.customerEmail || '');
  const [phone, setPhone] = useState(state.customerPhone || '');
  const [createAccount, setCreateAccount] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-fill from session if logged in
  useEffect(() => {
    if (session?.user) {
      if (!name && session.user.name) setName(session.user.name);
      if (!email && session.user.email) setEmail(session.user.email);
    }
  }, [session]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[\d\s+()-]{10,}$/.test(phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    // Update local state first
    const customerDetails = {
      customerName: name.trim(),
      customerEmail: email.trim(),
      customerPhone: phone.trim(),
      createAccount,
    };
    updateState(customerDetails);

    try {
      // Create the booking
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: state.quoteId,
          customerName: customerDetails.customerName,
          customerEmail: customerDetails.customerEmail,
          customerPhone: customerDetails.customerPhone,
          vehicleReg: state.vehicleReg || undefined,
          tyrePhotoUrl: state.tyrePhotoUrl || undefined,
          lockingNutStatus: state.lockingNutStatus || undefined,
          notes: undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create booking');
      }

      // Update state with booking details and Stripe client secret
      updateState({
        bookingId: data.bookingId,
        refNumber: data.refNumber,
        stripeClientSecret: data.clientSecret,
      });

      goToNext();
    } catch (error) {
      console.error('Failed to create booking:', error);
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to create booking'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoggedIn = !!session?.user;

  return (
    <VStack gap={6} align="stretch">
      <Box style={anim.fadeUp('0.5s')}>
        <Text fontSize="2xl" fontWeight="700" mb={2} color={c.text}>
          Your details
        </Text>
        <Text color={c.muted}>
          We&apos;ll use this to contact you about your booking.
        </Text>
      </Box>

      {isLoggedIn && (
        <Box p={3} bg="rgba(34,197,94,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(34,197,94,0.3)">
          <Text color="green.400" fontSize="sm">
            Logged in as {session.user.email}
          </Text>
        </Box>
      )}

      <Fieldset.Root>
        <Fieldset.Content>
          {/* Name */}
          <Field.Root invalid={!!errors.name}>
            <Field.Label fontWeight="500">
              Full name
              <Text as="span" color="red.500" ml={1}>*</Text>
            </Field.Label>
            <Box style={anim.fadeUp('0.4s', '0.1s')}>
            <Input {...inputProps}
              placeholder="John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="lg"
            />
            </Box>
            {errors.name && (
              <Field.ErrorText>{errors.name}</Field.ErrorText>
            )}
          </Field.Root>

          {/* Email */}
          <Field.Root invalid={!!errors.email}>
            <Field.Label fontWeight="500">
              Email address
              <Text as="span" color="red.500" ml={1}>*</Text>
            </Field.Label>
            <Box style={anim.fadeUp('0.4s', '0.2s')}>
            <Input {...inputProps}
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="lg"
            />
            </Box>
            {errors.email && (
              <Field.ErrorText>{errors.email}</Field.ErrorText>
            )}
            <Field.HelperText>
              We&apos;ll send booking confirmation here
            </Field.HelperText>
          </Field.Root>

          {/* Phone */}
          <Field.Root invalid={!!errors.phone}>
            <Field.Label fontWeight="500">
              Phone number
              <Text as="span" color="red.500" ml={1}>*</Text>
            </Field.Label>
            <Box style={anim.fadeUp('0.4s', '0.3s')}>
            <Input {...inputProps}
              type="tel"
              placeholder="07123 456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              size="lg"
            />
            </Box>
            {errors.phone && (
              <Field.ErrorText>{errors.phone}</Field.ErrorText>
            )}
            <Field.HelperText>
              The driver will call this number when arriving
            </Field.HelperText>
          </Field.Root>

          {/* Create Account Checkbox */}
          {!isLoggedIn && (
            <Box pt={2}>
              <Checkbox.Root
                checked={createAccount}
                onCheckedChange={(e) => setCreateAccount(!!e.checked)}
                colorPalette="orange"
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control
                  borderColor={c.input.border}
                  bg="transparent"
                />
                <Checkbox.Label color={c.text}>
                  <VStack align="start" gap={0}>
                    <Text fontWeight="500">Create an account</Text>
                    <Text fontSize="sm" color={c.muted}>
                      Track your bookings and get faster checkout next time
                    </Text>
                  </VStack>
                </Checkbox.Label>
              </Checkbox.Root>
            </Box>
          )}
        </Fieldset.Content>
      </Fieldset.Root>

      {/* Terms Notice */}
      <Box fontSize="sm" color={c.muted} pt={2}>
        By continuing, you agree to our{' '}
        <Link href="/terms" style={{ textDecoration: 'underline' }}>
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" style={{ textDecoration: 'underline' }}>
          Privacy Policy
        </Link>
        .
      </Box>

      {/* Submit Error */}
      {submitError && (
        <Box p={4} bg="rgba(239,68,68,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.3)">
          <Text color="red.400">{submitError}</Text>
        </Box>
      )}

      {/* Navigation */}
      <HStack gap={4} pt={4}>
        <Button variant="outline" onClick={goToPrev} flex="1" disabled={isSubmitting}>
          Back
        </Button>
        <Button
          colorPalette="orange"
          onClick={handleContinue}
          flex="1"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text>Creating booking...</Text>
            </HStack>
          ) : (
            'Continue to payment'
          )}
        </Button>
      </HStack>
    </VStack>
  );
}
