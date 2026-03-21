// components/admin/PushNotificationToggle.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Text, Flex } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import {
  isPushSupported,
  getPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribedToPush,
} from '@/lib/notifications/push-subscription';

type PushState = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export function PushNotificationToggle() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  const checkState = useCallback(async () => {
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }

    const permission = getPermissionState();
    if (permission === 'denied') {
      setState('denied');
      return;
    }

    const subscribed = await isSubscribedToPush();
    setState(subscribed ? 'subscribed' : 'unsubscribed');
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);

    try {
      if (state === 'subscribed') {
        const ok = await unsubscribeFromPush();
        if (ok) setState('unsubscribed');
      } else {
        const ok = await subscribeToPush();
        if (ok) {
          setState('subscribed');
        } else {
          // Permission might have been denied
          const perm = getPermissionState();
          setState(perm === 'denied' ? 'denied' : 'unsubscribed');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') return null;

  const statusLabel: Record<PushState, string> = {
    loading: '',
    unsupported: 'Push not supported',
    denied: 'Notifications blocked',
    subscribed: 'Push enabled',
    unsubscribed: 'Push disabled',
  };

  const canToggle = state === 'subscribed' || state === 'unsubscribed';

  return (
    <Flex
      align="center"
      justify="space-between"
      px="4"
      py="2.5"
      borderTop="1px solid"
      borderColor={c.border}
    >
      <Flex align="center" gap="2">
        {/* Bell with slash for off, solid bell for on */}
        <Box color={state === 'subscribed' ? c.accent : c.muted}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={state === 'subscribed' ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </Box>
        <Text fontSize="xs" color={c.muted}>
          {statusLabel[state]}
        </Text>
      </Flex>

      {canToggle && (
        <Box
          as="button"
          fontSize="xs"
          fontWeight="medium"
          color={state === 'subscribed' ? c.muted : c.accent}
          opacity={busy ? 0.5 : 1}
          _hover={{ textDecoration: 'underline' }}
          onClick={handleToggle}
          aria-disabled={busy}
        >
          {busy
            ? '...'
            : state === 'subscribed'
              ? 'Disable'
              : 'Enable'}
        </Box>
      )}

      {state === 'denied' && (
        <Text fontSize="xs" color={c.muted} opacity={0.6}>
          Check browser settings
        </Text>
      )}
    </Flex>
  );
}
