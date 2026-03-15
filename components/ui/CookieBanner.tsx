'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Text, VStack } from '@chakra-ui/react';
import Link from 'next/link';
import { colorTokens as c } from '@/lib/design-tokens';

const CONSENT_KEY = 'tyrerescue_consent_v2';

interface ConsentData {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
  version: '2';
}

export function getConsent(): ConsentData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentData;
  } catch {
    return null;
  }
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        cursor: 'pointer',
        background: on ? c.accent : c.border,
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }}
      />
    </button>
  );
}

export function CookieBanner() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preferences, setPreferences] = useState({ analytics: false, marketing: false });
  const [bannerTitle, setBannerTitle] = useState('We use cookies');
  const [bannerMessage, setBannerMessage] = useState(
    'We use essential cookies to make this site work. With your consent, we also use analytics cookies to improve your experience.'
  );

  useEffect(() => {
    const existing = getConsent();
    if (!existing) {
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleReset = () => {
      setPreferences({ analytics: false, marketing: false });
      setExpanded(false);
      setShow(true);
    };
    window.addEventListener('cookie-consent-reset', handleReset);
    return () => window.removeEventListener('cookie-consent-reset', handleReset);
  }, []);

  useEffect(() => {
    fetch('/api/public/cookie-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.bannerTitle) setBannerTitle(data.bannerTitle);
        if (data?.bannerMessage) setBannerMessage(data.bannerMessage);
      })
      .catch(() => {});
  }, []);

  const saveConsent = useCallback((analytics: boolean, marketing: boolean) => {
    const consent: ConsentData = {
      essential: true,
      analytics,
      marketing,
      timestamp: Date.now(),
      version: '2',
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    window.dispatchEvent(new CustomEvent('cookie-consent-updated'));
    setShow(false);
    setExpanded(false);
  }, []);

  if (!show) return null;

  const btnBase: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    padding: '10px 20px',
    cursor: 'pointer',
    minHeight: 48,
    border: `1px solid ${c.border}`,
    background: 'transparent',
    color: c.muted,
    transition: 'border-color 0.2s, background 0.2s',
  };

  return (
    <Box
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex={200}
      bg={c.card}
      borderTop={`2px solid ${c.border}`}
      p={{ base: '16px', md: '24px' }}
    >
      {!expanded ? (
        <Flex
          maxW="7xl"
          mx="auto"
          justify="space-between"
          align="center"
          flexWrap="wrap"
          gap={3}
        >
          <Box flex={1} minW="200px">
            <Text
              color={c.text}
              fontSize="14px"
              fontWeight="600"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {bannerTitle}
            </Text>
            <Text
              color={c.muted}
              fontSize="13px"
              mt="2px"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {bannerMessage}{' '}
              <Link href="/cookie-policy" style={{ color: c.accent, textDecoration: 'underline' }}>
                Learn more
              </Link>
            </Text>
          </Box>
          <Flex gap={2} flexWrap="wrap">
            <button
              type="button"
              style={btnBase}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
              onClick={() => setExpanded(true)}
            >
              Customise
            </button>
            <button
              type="button"
              style={btnBase}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border; }}
              onClick={() => saveConsent(false, false)}
            >
              Reject All
            </button>
            <button
              type="button"
              style={{
                ...btnBase,
                background: c.accent,
                color: '#09090B',
                border: 'none',
                fontWeight: 600,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = c.accentHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = c.accent; }}
              onClick={() => saveConsent(true, true)}
            >
              Accept All
            </button>
          </Flex>
        </Flex>
      ) : (
        <Box maxW="7xl" mx="auto">
          <Text
            color={c.text}
            fontSize="15px"
            fontWeight="600"
            mb="16px"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Cookie Preferences
          </Text>

          <VStack align="stretch" gap={3}>
            {/* Essential */}
            <Flex justify="space-between" align="center" gap={4}>
              <Box>
                <Text color={c.text} fontSize="14px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
                  Essential Cookies
                </Text>
                <Text color={c.muted} fontSize="12px" style={{ fontFamily: 'var(--font-body)' }}>
                  Required for login, payments and booking. Cannot be disabled.
                </Text>
              </Box>
              <Box
                bg={c.accent}
                borderRadius="12px"
                px="12px"
                py="4px"
                flexShrink={0}
              >
                <Text
                  fontSize="11px"
                  fontWeight="700"
                  color="#09090B"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  ALWAYS ON
                </Text>
              </Box>
            </Flex>

            {/* Analytics */}
            <Flex justify="space-between" align="center" gap={4}>
              <Box>
                <Text color={c.text} fontSize="14px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
                  Analytics Cookies
                </Text>
                <Text color={c.muted} fontSize="12px" style={{ fontFamily: 'var(--font-body)' }}>
                  Google Analytics and Clarity. Helps us improve the site.
                </Text>
              </Box>
              <Toggle
                on={preferences.analytics}
                onToggle={() => setPreferences((p) => ({ ...p, analytics: !p.analytics }))}
              />
            </Flex>

            {/* Marketing */}
            <Flex justify="space-between" align="center" gap={4}>
              <Box>
                <Text color={c.text} fontSize="14px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
                  Marketing Cookies
                </Text>
                <Text color={c.muted} fontSize="12px" style={{ fontFamily: 'var(--font-body)' }}>
                  Meta Pixel for relevant ads. We never sell your data.
                </Text>
              </Box>
              <Toggle
                on={preferences.marketing}
                onToggle={() => setPreferences((p) => ({ ...p, marketing: !p.marketing }))}
              />
            </Flex>
          </VStack>

          <Flex gap={2} mt="16px" flexWrap="wrap">
            <button
              type="button"
              style={{
                ...btnBase,
                background: c.accent,
                color: '#09090B',
                border: 'none',
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 400,
                height: 44,
                paddingLeft: 24,
                paddingRight: 24,
              }}
              onClick={() => saveConsent(preferences.analytics, preferences.marketing)}
            >
              Save Preferences
            </button>
            <button
              type="button"
              style={{
                ...btnBase,
                background: c.accent,
                color: '#09090B',
                border: 'none',
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 400,
                height: 44,
                paddingLeft: 24,
                paddingRight: 24,
              }}
              onClick={() => saveConsent(true, true)}
            >
              Accept All
            </button>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
