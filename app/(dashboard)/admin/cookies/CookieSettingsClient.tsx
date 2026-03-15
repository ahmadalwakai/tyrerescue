'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Text, VStack, SimpleGrid, Textarea } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface Setting {
  id: string;
  key: string;
  value: string;
  label: string | null;
  description: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? c.accent : c.border,
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="8px" p="24px">
      {children}
    </Box>
  );
}

export function CookieSettingsClient() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Local state for input values
  const [ga4Id, setGa4Id] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [clarityId, setClarityId] = useState('');
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerMsg, setBannerMsg] = useState('');

  const val = useCallback(
    (key: string) => settings.find((s) => s.key === key)?.value ?? '',
    [settings]
  );

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cookie-settings');
      if (!res.ok) return;
      const data: Setting[] = await res.json();
      setSettings(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  useEffect(() => {
    if (settings.length) {
      setGa4Id(val('ga4_measurement_id'));
      setPixelId(val('meta_pixel_id'));
      setClarityId(val('microsoft_clarity_id'));
      setBannerTitle(val('cookie_banner_title'));
      setBannerMsg(val('cookie_banner_message'));
    }
  }, [settings, val]);

  async function patch(key: string, value: string) {
    setSaving(key);
    try {
      const res = await fetch(`/api/admin/cookie-settings/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) await fetchSettings();
    } catch { /* ignore */ } finally {
      setSaving(null);
    }
  }

  async function toggle(key: string) {
    const current = val(key);
    await patch(key, current === 'true' ? 'false' : 'true');
  }

  if (loading) {
    return <Text color={c.muted}>Loading settings…</Text>;
  }

  const btnStyle: React.CSSProperties = {
    background: c.accent,
    color: '#09090B',
    border: 'none',
    borderRadius: 6,
    height: 44,
    padding: '0 20px',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    fontWeight: 600,
    flexShrink: 0,
    minHeight: 48,
  };

  return (
    <VStack align="stretch" gap={6} maxW="800px">
      {/* SECTION 1 — Google Analytics 4 */}
      <Card>
        <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
          <Box>
            <Text color={c.text} fontSize="16px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
              Google Analytics 4
            </Text>
            <Text color={c.muted} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
              Track visitors, page views and booking conversions.
            </Text>
          </Box>
          <Toggle
            on={val('ga4_enabled') === 'true'}
            onToggle={() => toggle('ga4_enabled')}
            disabled={saving === 'ga4_enabled'}
          />
        </Flex>
        {val('ga4_enabled') === 'true' && (
          <Box mt={4}>
            <Text color={c.muted} fontSize="12px" mb={1} style={{ fontFamily: 'var(--font-body)' }}>
              MEASUREMENT ID
            </Text>
            <Flex gap={2}>
              <input
                type="text"
                style={{
                  flex: 1,
                  background: c.input.bg,
                  border: `1px solid ${c.input.border}`,
                  color: c.input.text,
                  fontSize: 15,
                  height: 48,
                  borderRadius: 6,
                  padding: '0 12px',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
                placeholder="G-XXXXXXXXXX"
                value={ga4Id}
                onChange={(e) => setGa4Id(e.target.value)}
              />
              <button
                type="button"
                style={btnStyle}
                disabled={saving === 'ga4_measurement_id'}
                onClick={() => patch('ga4_measurement_id', ga4Id)}
              >
                {saving === 'ga4_measurement_id' ? '…' : 'Save'}
              </button>
            </Flex>
            <Text color={c.muted} fontSize="11px" mt={2} style={{ fontFamily: 'var(--font-body)' }}>
              Find your Measurement ID in Google Analytics: Admin → Data Streams → your stream → Measurement ID
            </Text>
            {val('ga4_measurement_id') && (
              <Text color={c.accent} fontSize="12px" mt={2} style={{ fontFamily: 'var(--font-body)' }}>
                GA4 is active. Loads for users who accept analytics cookies.
              </Text>
            )}
          </Box>
        )}
      </Card>

      {/* SECTION 2 — Meta Pixel */}
      <Card>
        <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
          <Box>
            <Text color={c.text} fontSize="16px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
              Meta Pixel
            </Text>
            <Text color={c.muted} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
              Facebook and Instagram conversion tracking and retargeting.
            </Text>
          </Box>
          <Toggle
            on={val('meta_pixel_enabled') === 'true'}
            onToggle={() => toggle('meta_pixel_enabled')}
            disabled={saving === 'meta_pixel_enabled'}
          />
        </Flex>
        {val('meta_pixel_enabled') === 'true' && (
          <Box mt={4}>
            <Text color={c.muted} fontSize="12px" mb={1} style={{ fontFamily: 'var(--font-body)' }}>
              PIXEL ID
            </Text>
            <Flex gap={2}>
              <input
                type="text"
                style={{
                  flex: 1,
                  background: c.input.bg,
                  border: `1px solid ${c.input.border}`,
                  color: c.input.text,
                  fontSize: 15,
                  height: 48,
                  borderRadius: 6,
                  padding: '0 12px',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
                placeholder="123456789012345"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
              />
              <button
                type="button"
                style={btnStyle}
                disabled={saving === 'meta_pixel_id'}
                onClick={() => patch('meta_pixel_id', pixelId)}
              >
                {saving === 'meta_pixel_id' ? '…' : 'Save'}
              </button>
            </Flex>
            <Text color={c.muted} fontSize="11px" mt={2} style={{ fontFamily: 'var(--font-body)' }}>
              Find your Pixel ID in Meta Business Suite → Events Manager → your pixel
            </Text>
            {val('meta_pixel_id') && (
              <Text color={c.accent} fontSize="12px" mt={2} style={{ fontFamily: 'var(--font-body)' }}>
                Meta Pixel is active. Loads for users who accept marketing cookies.
              </Text>
            )}
          </Box>
        )}
      </Card>

      {/* SECTION 3 — Microsoft Clarity */}
      <Card>
        <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
          <Box>
            <Text color={c.text} fontSize="16px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
              Microsoft Clarity
            </Text>
            <Text color={c.muted} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
              Free session recordings and heatmaps for UX analysis.
            </Text>
          </Box>
          <Toggle
            on={val('clarity_enabled') === 'true'}
            onToggle={() => toggle('clarity_enabled')}
            disabled={saving === 'clarity_enabled'}
          />
        </Flex>
        {val('clarity_enabled') === 'true' && (
          <Box mt={4}>
            <Text color={c.muted} fontSize="12px" mb={1} style={{ fontFamily: 'var(--font-body)' }}>
              PROJECT ID
            </Text>
            <Flex gap={2}>
              <input
                type="text"
                style={{
                  flex: 1,
                  background: c.input.bg,
                  border: `1px solid ${c.input.border}`,
                  color: c.input.text,
                  fontSize: 15,
                  height: 48,
                  borderRadius: 6,
                  padding: '0 12px',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
                placeholder="abc123xyz"
                value={clarityId}
                onChange={(e) => setClarityId(e.target.value)}
              />
              <button
                type="button"
                style={btnStyle}
                disabled={saving === 'microsoft_clarity_id'}
                onClick={() => patch('microsoft_clarity_id', clarityId)}
              >
                {saving === 'microsoft_clarity_id' ? '…' : 'Save'}
              </button>
            </Flex>
            <Text color={c.muted} fontSize="11px" mt={2} style={{ fontFamily: 'var(--font-body)' }}>
              Free session recordings and heatmaps. Find your Project ID at clarity.microsoft.com
            </Text>
            <Text color={c.muted} fontSize="12px" mt={1} style={{ fontFamily: 'var(--font-body)' }}>
              Clarity is free. Recommended for UX analysis of the booking wizard.
            </Text>
            {val('microsoft_clarity_id') && (
              <Text color={c.accent} fontSize="12px" mt={2} style={{ fontFamily: 'var(--font-body)' }}>
                Clarity is active. Loads for users who accept analytics cookies.
              </Text>
            )}
          </Box>
        )}
      </Card>

      {/* SECTION 4 — Cookie Banner Text */}
      <Card>
        <Text color={c.text} fontSize="16px" fontWeight="600" mb={4} style={{ fontFamily: 'var(--font-body)' }}>
          Cookie Banner Customisation
        </Text>

        <Box mb={4}>
          <Text color={c.muted} fontSize="12px" mb={1} style={{ fontFamily: 'var(--font-body)' }}>
            BANNER HEADING
          </Text>
          <Flex gap={2}>
            <input
              type="text"
              style={{
                flex: 1,
                background: c.input.bg,
                border: `1px solid ${c.input.border}`,
                color: c.input.text,
                fontSize: 15,
                height: 48,
                borderRadius: 6,
                padding: '0 12px',
                outline: 'none',
                fontFamily: 'var(--font-body)',
              }}
              value={bannerTitle}
              onChange={(e) => setBannerTitle(e.target.value)}
            />
            <button
              type="button"
              style={btnStyle}
              disabled={saving === 'cookie_banner_title'}
              onClick={() => patch('cookie_banner_title', bannerTitle)}
            >
              {saving === 'cookie_banner_title' ? '…' : 'Save'}
            </button>
          </Flex>
        </Box>

        <Box mb={4}>
          <Text color={c.muted} fontSize="12px" mb={1} style={{ fontFamily: 'var(--font-body)' }}>
            BANNER MESSAGE
          </Text>
          <Flex gap={2} direction={{ base: 'column', md: 'row' }}>
            <Textarea
              flex={1}
              rows={3}
              value={bannerMsg}
              onChange={(e) => setBannerMsg(e.target.value)}
              bg={c.input.bg}
              borderColor={c.input.border}
              color={c.input.text}
              fontSize="15px"
              borderRadius="6px"
              _focus={{
                borderColor: c.input.borderFocus,
                boxShadow: `0 0 0 1px ${c.input.borderFocus}`,
              }}
            />
            <button
              type="button"
              style={{ ...btnStyle, alignSelf: 'flex-start' }}
              disabled={saving === 'cookie_banner_message'}
              onClick={() => patch('cookie_banner_message', bannerMsg)}
            >
              {saving === 'cookie_banner_message' ? '…' : 'Save'}
            </button>
          </Flex>
        </Box>

        <Box
          bg={c.surface}
          borderWidth="1px"
          borderColor={c.border}
          borderRadius="8px"
          p="16px"
          mt={2}
        >
          <Text color={c.muted} fontSize="11px" mb={2} style={{ fontFamily: 'var(--font-body)' }}>
            PREVIEW
          </Text>
          <Text color={c.text} fontSize="14px" fontWeight="600" style={{ fontFamily: 'var(--font-body)' }}>
            {bannerTitle || 'We use cookies'}
          </Text>
          <Text color={c.muted} fontSize="13px" mt="2px" style={{ fontFamily: 'var(--font-body)' }}>
            {bannerMsg || 'We use essential cookies to make this site work.'}
          </Text>
        </Box>
      </Card>

      {/* SECTION 5 — Consent Statistics */}
      <Card>
        <Text color={c.text} fontSize="16px" fontWeight="600" mb={2} style={{ fontFamily: 'var(--font-body)' }}>
          Consent Overview
        </Text>
        <Text color={c.muted} fontSize="13px" mb={4} style={{ fontFamily: 'var(--font-body)' }}>
          These statistics are based on localStorage and cannot be tracked server-side. Use GA4 for accurate visitor data.
        </Text>

        <SimpleGrid columns={{ base: 2, md: 3 }} gap={4}>
          {['Accepted All', 'Rejected All', 'Custom Preferences'].map((label) => (
            <Box key={label} bg={c.surface} borderWidth="1px" borderColor={c.border} borderRadius="8px" p={4} textAlign="center">
              <Text color={c.muted} fontSize="12px" style={{ fontFamily: 'var(--font-body)' }}>{label}</Text>
              <Text color={c.text} fontSize="24px" fontWeight="700" mt={1}>—</Text>
            </Box>
          ))}
        </SimpleGrid>

        <Text color={c.muted} fontSize="12px" mt={4} style={{ fontFamily: 'var(--font-body)' }}>
          Detailed consent analytics require GA4 with consent mode v2.
        </Text>
      </Card>
    </VStack>
  );
}
