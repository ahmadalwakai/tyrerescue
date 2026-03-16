'use client';

import { Box, VStack, HStack, Text, Button } from '@chakra-ui/react';
import {
  SelectedTyre,
  removeFromCart,
  updateCartQuantity,
  cartTotal,
  cartItemCount,
} from './types';
import { formatPrice } from '@/lib/pricing-engine';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface CartSummaryProps {
  cart: SelectedTyre[];
  onChange?: (cart: SelectedTyre[]) => void;
  compact?: boolean;
}

export function CartSummary({ cart, onChange, compact = false }: CartSummaryProps) {
  const editable = !!onChange;
  const total = cartTotal(cart);
  const count = cartItemCount(cart);

  if (cart.length === 0) {
    return (
      <Box p={4} bg={c.surface} borderRadius="md" textAlign="center">
        <Text color={c.muted} fontSize="sm">Your cart is empty</Text>
      </Box>
    );
  }

  if (compact) {
    return (
      <Box
        p={3}
        bg={c.surface}
        borderRadius="md"
        borderWidth="1px"
        borderColor={c.border}
        style={anim.fadeIn()}
      >
        <HStack justify="space-between">
          <Text fontSize="sm" color={c.muted}>
            {count} tyre{count !== 1 ? 's' : ''} in cart
          </Text>
          <Text fontWeight="600" color={c.accent}>
            {formatPrice(total)}
          </Text>
        </HStack>
        <VStack align="stretch" gap={1} mt={2}>
          {cart.map((item) => (
            <HStack key={item.tyreId} justify="space-between" fontSize="xs" color={c.muted}>
              <Text truncate maxW="200px">
                {item.quantity}x {item.brand} {item.pattern}
              </Text>
              <Text>{formatPrice(item.unitPrice * item.quantity)}</Text>
            </HStack>
          ))}
        </VStack>
      </Box>
    );
  }

  return (
    <Box
      borderWidth="1px"
      borderColor={c.border}
      borderRadius="lg"
      overflow="hidden"
      style={anim.fadeUp('0.4s')}
    >
      <Box p={4} bg={c.surface} borderBottomWidth="1px" borderColor={c.border}>
        <Text fontWeight="600" color={c.text}>
          Your cart ({count} tyre{count !== 1 ? 's' : ''})
        </Text>
      </Box>

      <VStack gap={0} align="stretch">
        {cart.map((item, i) => (
          <Box
            key={item.tyreId}
            p={4}
            borderBottomWidth={i < cart.length - 1 ? '1px' : '0'}
            borderColor={c.border}
          >
            <HStack justify="space-between" align="start" flexDir={{ base: 'column', md: 'row' }} gap={2}>
              <Box>
                <Text fontWeight="500" color={c.text}>
                  {item.brand} {item.pattern}
                </Text>
                <Text fontSize="sm" color={c.muted}>
                  {item.sizeDisplay}
                </Text>
                {item.isPreOrder && (
                  <Text fontSize="xs" color={c.accent} mt={1}>
                    Pre-order — 2-3 working days
                  </Text>
                )}
              </Box>
              <HStack gap={3} align="center">
                {editable ? (
                  <HStack gap={1}>
                    <Box
                      as="button"
                      w="32px"
                      h="32px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      borderWidth="1px"
                      borderColor={c.border}
                      borderRadius="md"
                      bg={c.card}
                      color={c.text}
                      _hover={{ borderColor: c.accent }}
                      onClick={() =>
                        onChange(updateCartQuantity(cart, item.tyreId, item.quantity - 1))
                      }
                    >
                      -
                    </Box>
                    <Text
                      w="28px"
                      textAlign="center"
                      fontWeight="600"
                      color={c.text}
                      fontSize="sm"
                    >
                      {item.quantity}
                    </Text>
                    <Box
                      as="button"
                      w="32px"
                      h="32px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      borderWidth="1px"
                      borderColor={c.border}
                      borderRadius="md"
                      bg={c.card}
                      color={c.text}
                      _hover={{ borderColor: c.accent }}
                      onClick={() =>
                        onChange(updateCartQuantity(cart, item.tyreId, item.quantity + 1))
                      }
                    >
                      +
                    </Box>
                  </HStack>
                ) : (
                  <Text fontSize="sm" color={c.muted}>
                    x{item.quantity}
                  </Text>
                )}
                <Text fontWeight="600" color={c.accent} minW="70px" textAlign="right">
                  {formatPrice(item.unitPrice * item.quantity)}
                </Text>
                {editable && (
                  <Box
                    as="button"
                    fontSize="xs"
                    color="red.400"
                    _hover={{ color: 'red.300' }}
                    onClick={() => onChange(removeFromCart(cart, item.tyreId))}
                  >
                    Remove
                  </Box>
                )}
              </HStack>
            </HStack>
          </Box>
        ))}
      </VStack>

      <Box p={4} bg={c.surface} borderTopWidth="1px" borderColor={c.border}>
        <HStack justify="space-between">
          <Text fontWeight="600" color={c.text}>
            Tyre total
          </Text>
          <Text fontWeight="700" fontSize="lg" color={c.accent}>
            {formatPrice(total)}
          </Text>
        </HStack>
      </Box>
    </Box>
  );
}
