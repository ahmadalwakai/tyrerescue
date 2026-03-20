'use client';

import { useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import { colorTokens } from '@/lib/design-tokens';

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: HTMLElement, reload?: boolean) => void;
    };
  }
}

export function TrustpilotReviewCollector() {
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (widgetRef.current && window.Trustpilot?.loadFromElement) {
      window.Trustpilot.loadFromElement(widgetRef.current, true);
    }
  }, []);

  return (
    <Box
      width="100%"
      maxW={{ base: '100%', md: '560px' }}
      mx={{ base: 'auto', md: 0 }}
      borderWidth="1px"
      borderColor={colorTokens.border}
      bg={colorTokens.surface}
      borderRadius="12px"
      px={{ base: 4, md: 5 }}
      py={{ base: 3, md: 4 }}
      overflow="hidden"
    >
      <div
        ref={widgetRef}
        className="trustpilot-widget"
        data-locale="en-GB"
        data-template-id="56278e9abfbbba0bdcd568bc"
        data-businessunit-id="69b71bc6a3e208775fa08df0"
        data-style-height="52px"
        data-style-width="100%"
        data-token="23755ca8-5489-4f2c-a3c5-d934ace65179"
      >
        <a
          href="https://uk.trustpilot.com/review/tyrerescue.uk"
          target="_blank"
          rel="noopener"
        >
          Trustpilot
        </a>
      </div>
    </Box>
  );
}
