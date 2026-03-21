// components/admin/SoundToggle.tsx
'use client';

import { useState, useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { isSoundEnabled, setSoundEnabled } from '@/lib/notifications/sound-manager';

export function SoundToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  const toggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    setSoundEnabled(newValue);
  };

  return (
    <Box
      as="button"
      onClick={toggle}
      p="2"
      borderRadius="md"
      color={c.muted}
      _hover={{ color: c.text, bg: c.card }}
      transition="all 0.2s"
      aria-label={enabled ? 'Mute notifications' : 'Unmute notifications'}
      title={enabled ? 'Sound on — click to mute' : 'Sound off — click to unmute'}
    >
      {enabled ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      )}
    </Box>
  );
}
