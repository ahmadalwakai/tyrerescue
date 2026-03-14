'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
} from '@chakra-ui/react';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { formatPrice, PricingBreakdown } from '@/lib/pricing-engine';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

// Load Stripe outside of component to avoid recreating on every render
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export interface StepPaymentProps {
  clientSecret: string;
  bookingId: string;
  refNumber: string;
  breakdown: PricingBreakdown;
  onSuccess: (refNumber: string) => void;
  onError: (error: string) => void;
}

/**
 * Inner component that has access to Stripe hooks
 */
function CheckoutForm({
  bookingId,
  refNumber,
  breakdown,
  onSuccess,
  onError,
}: Omit<StepPaymentProps, 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/success/${refNumber}`,
      },
      redirect: 'if_required',
    });

    if (error) {
      // Payment failed
      setErrorMessage(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
      onError(error.message || 'Payment failed');
    } else {
      // Payment succeeded without redirect (unlikely with Payment Element)
      onSuccess(refNumber);
    }
  };

  // Filter items to display
  const mainItems = useMemo(() => breakdown.lineItems.filter(
    item => item.type === 'tyre' || item.type === 'service' || item.type === 'callout'
  ), [breakdown]);
  const surchargeItems = useMemo(() => breakdown.lineItems.filter(item => item.type === 'surcharge'), [breakdown]);
  const discountItems = useMemo(() => breakdown.lineItems.filter(item => item.type === 'discount'), [breakdown]);

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={6} align="stretch">
        {/* Order Summary */}
        <Box style={anim.slideInLeft('0.6s', '0.1s')}>
          <Text fontWeight="600" fontSize="lg" mb={4}>
            Order Summary
          </Text>
          <Box
            bg={c.surface}
            borderRadius="md"
            p={4}
            borderWidth="1px"
            borderColor={c.border}
          >
            <VStack gap={3} align="stretch">
              {/* Main line items */}
              {mainItems.map((item, index) => (
                <HStack key={index} justify="space-between">
                  <Box>
                    <Text color={c.muted}>{item.label}</Text>
                    {item.quantity && item.quantity > 1 && item.unitPrice && (
                      <Text fontSize="xs" color={c.muted}>
                        {formatPrice(item.unitPrice)} x {item.quantity}
                      </Text>
                    )}
                  </Box>
                  <Text color={c.text}>{formatPrice(item.amount)}</Text>
                </HStack>
              ))}

              {/* Surcharges */}
              {surchargeItems.map((item, index) => (
                <HStack key={`surcharge-${index}`} justify="space-between">
                  <Text color={c.muted}>{item.label}</Text>
                  <Text color={c.text}>{formatPrice(item.amount)}</Text>
                </HStack>
              ))}

              {/* Discounts */}
              {discountItems.map((item, index) => (
                <HStack key={`discount-${index}`} justify="space-between">
                  <Text color="green.400">{item.label}</Text>
                  <Text color="green.400">
                    -{formatPrice(Math.abs(item.amount))}
                  </Text>
                </HStack>
              ))}

              <Box borderTopWidth="1px" borderColor={c.border} pt={3}>
                <HStack justify="space-between">
                  <Text color={c.muted}>Subtotal</Text>
                  <Text color={c.text}>{formatPrice(breakdown.subtotal)}</Text>
                </HStack>
              </Box>

              {breakdown.surgeMultiplier !== 1 && (
                <HStack justify="space-between">
                  <Text color={c.muted} fontSize="sm">
                    Demand adjustment
                  </Text>
                  <Text fontSize="sm" color={c.text}>
                    {breakdown.surgeMultiplier > 1 ? '+' : ''}
                    {((breakdown.surgeMultiplier - 1) * 100).toFixed(0)}%
                  </Text>
                </HStack>
              )}

              <HStack justify="space-between">
                <Text color={c.muted}>VAT (20%)</Text>
                <Text color={c.text}>{formatPrice(breakdown.vatAmount)}</Text>
              </HStack>

              <Box borderTopWidth="2px" borderColor={c.border} pt={3}>
                <HStack justify="space-between">
                  <Text fontWeight="700" fontSize="lg" color={c.text}>
                    Total
                  </Text>
                  <Text fontWeight="700" fontSize="lg" color={c.accent}>
                    {formatPrice(breakdown.total)}
                  </Text>
                </HStack>
              </Box>
            </VStack>
          </Box>
        </Box>

        {/* Payment Element */}
        <Box style={anim.slideInRight('0.6s', '0.1s')}>
          <Text fontWeight="600" fontSize="lg" mb={4}>
            Payment Details
          </Text>
          <Box
            bg={c.surface}
            borderRadius="md"
            p={4}
            borderWidth="1px"
            borderColor={c.border}
          >
            <PaymentElement
              options={{
                layout: 'accordion',
              }}
            />
          </Box>
        </Box>

        {/* Error Message */}
        {errorMessage && (
          <Box
            bg="rgba(239,68,68,0.1)"
            borderWidth="1px"
            borderColor="rgba(239,68,68,0.3)"
            borderRadius="md"
            p={4}
          >
            <Text color="red.400" fontSize="sm">
              {errorMessage}
            </Text>
          </Box>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          size="lg"
          colorPalette="orange"
          disabled={!stripe || !elements || isProcessing}
          width="full"
        >
          {isProcessing ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text>Processing payment...</Text>
            </HStack>
          ) : (
            `Pay ${formatPrice(breakdown.total)}`
          )}
        </Button>

        {/* Security Notice */}
        <Text fontSize="xs" color={c.muted} textAlign="center">
          Your payment is secured by Stripe. We never store your card details.
        </Text>
      </VStack>
    </form>
  );
}

/**
 * Step Payment Component
 * 
 * Wraps the checkout form in Stripe Elements provider.
 * Displays order summary alongside the payment form.
 * 
 * Design rules:
 * - No icons, no emojis, no decorative characters
 * - Typography and spacing carry hierarchy
 * - Professional, clean layout
 */
export function StepPayment({
  clientSecret,
  bookingId,
  refNumber,
  breakdown,
  onSuccess,
  onError,
}: StepPaymentProps) {
  const [ready, setReady] = useState(false);

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'night',
      variables: {
        colorPrimary: c.accent,
        colorBackground: c.surface,
        colorText: c.text,
        colorDanger: '#ef4444',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '6px',
      },
    },
  };

  useEffect(() => {
    if (clientSecret) {
      setReady(true);
    }
  }, [clientSecret]);

  if (!ready) {
    return (
      <Box py={12} textAlign="center">
        <Spinner size="lg" />
        <Text mt={4} color={c.muted}>
          Preparing secure payment...
        </Text>
      </Box>
    );
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm
        bookingId={bookingId}
        refNumber={refNumber}
        breakdown={breakdown}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}
