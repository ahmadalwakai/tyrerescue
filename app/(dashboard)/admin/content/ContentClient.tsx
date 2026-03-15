'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Textarea, Flex, Badge, NativeSelect, Spinner } from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps, selectProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { useRouter } from 'next/navigation';

interface ContentItem {
  id: string;
  key: string;
  value: string;
  label: string | null;
}

const CONTENT_KEYS = [
  { key: 'site_banner_text', label: 'Site Banner Text', placeholder: 'e.g. Free callout within Glasgow!' },
  { key: 'site_banner_active', label: 'Show Banner (true/false)', placeholder: 'true' },
  { key: 'site_phone', label: 'Contact Phone', placeholder: '07XXX XXXXXX' },
  { key: 'site_email', label: 'Contact Email', placeholder: 'support@tyrerescue.uk' },
  { key: 'site_min_order', label: 'Minimum Order Text', placeholder: 'No minimum order' },
  { key: 'site_service_radius', label: 'Service Radius', placeholder: '30 miles' },
];

export function ContentClient({ items }: { items: ContentItem[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const valueMap = Object.fromEntries(items.map((i) => [i.key, { id: i.id, value: i.value }]));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const updates = CONTENT_KEYS.map((ck) => ({
      key: ck.key,
      label: ck.label,
      value: (fd.get(ck.key) as string) || '',
    }));

    await fetch('/api/admin/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: updates }),
    });
    setSaving(false);
    router.refresh();
  }

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };

  return (
    <VStack align="stretch" gap={6}>
      <Box style={anim.fadeUp()}>
        <Heading size="lg" color={c.text}>Content</Heading>
        <Text color={c.muted} mt={1}>Manage site-wide text and settings</Text>
      </Box>

      <form onSubmit={handleSubmit}>
        <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.1s')}>
        <VStack align="stretch" gap={5}>
          {CONTENT_KEYS.map((ck) => (
            <Box key={ck.key}>
              <Text color={c.muted} fontSize="sm" mb={1}>{ck.label}</Text>
              {ck.key === 'site_banner_text' ? (
                <Textarea {...textareaProps} {...textareaProps} name={ck.key} placeholder={ck.placeholder} defaultValue={valueMap[ck.key]?.value ?? ''} rows={2} />
              ) : (
                <Input {...inputProps} name={ck.key} placeholder={ck.placeholder} defaultValue={valueMap[ck.key]?.value ?? ''} />
              )}
            </Box>
          ))}

          <Button type="submit" bg={c.accent} color="white" _hover={{ bg: c.accentHover }} alignSelf={{ base: 'stretch', md: 'flex-start' }} minH="48px" disabled={saving}>
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </VStack>
      </Box>
      </form>

      <CityContentGenerator />
    </VStack>
  );
}

const CITIES = [
  'glasgow', 'edinburgh', 'dundee', 'aberdeen', 'stirling', 'paisley',
  'east-kilbride', 'livingston', 'hamilton', 'airdrie', 'cumbernauld',
  'kirkintilloch', 'motherwell', 'dumfries',
];

interface CityContent {
  heroSubtext: string;
  coverageDescription: string;
  localKnowledge: string;
  metaDescription: string;
}

function CityContentGenerator() {
  const [selectedCity, setSelectedCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<CityContent | null>(null);
  const [cityName, setCityName] = useState('');

  async function generate() {
    if (!selectedCity) return;
    setLoading(true);
    setContent(null);
    try {
      const res = await fetch('/api/admin/seo/generate-city-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citySlug: selectedCity }),
      });
      if (res.ok) {
        const data = await res.json();
        setContent(data.content);
        setCityName(data.cityName);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  return (
    <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.2s')}>
      <Flex justify="space-between" align="center" mb={4}>
        <Box>
          <Heading size="md" color={c.text}>AI City Content Generator</Heading>
          <Text fontSize="sm" color={c.muted}>Generate SEO-optimised content for city service pages</Text>
        </Box>
        <Badge colorPalette="orange" size="sm">⚡ AI Powered</Badge>
      </Flex>

      <HStack gap={3} mb={4}>
        <NativeSelect.Root>
          <NativeSelect.Field
            {...selectProps}
            value={selectedCity}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCity(e.target.value)}
          >
            <option value="">Select city...</option>
            {CITIES.map((city) => (
              <option key={city} value={city}>
                {city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </NativeSelect.Field>
        </NativeSelect.Root>
        <Button
          onClick={generate}
          disabled={!selectedCity || loading}
          bg={c.accent}
          color="white"
          _hover={{ bg: c.accentHover }}
          minH="40px"
          px={6}
        >
          {loading ? <><Spinner size="xs" mr={2} /> Generating...</> : 'Generate with AI'}
        </Button>
      </HStack>

      {content && (
        <VStack align="stretch" gap={4} mt={4} p={4} bg={c.surface} borderRadius="md">
          <Text fontWeight="700" color={c.accent} fontSize="lg">{cityName} Content Preview</Text>

          <Box>
            <Text fontSize="xs" color={c.muted} mb={1}>Hero Subtext</Text>
            <Text color={c.text} fontSize="sm">{content.heroSubtext}</Text>
          </Box>

          <Box>
            <Text fontSize="xs" color={c.muted} mb={1}>Coverage Description</Text>
            <Text color={c.text} fontSize="sm">{content.coverageDescription}</Text>
          </Box>

          <Box>
            <Text fontSize="xs" color={c.muted} mb={1}>Local Knowledge</Text>
            <Text color={c.text} fontSize="sm">{content.localKnowledge}</Text>
          </Box>

          <Box>
            <Text fontSize="xs" color={c.muted} mb={1}>Meta Description ({content.metaDescription.length} chars)</Text>
            <Text color={c.text} fontSize="sm" fontFamily="mono">{content.metaDescription}</Text>
          </Box>

          <Text fontSize="xs" color={c.muted}>Copy content into your city pages as needed.</Text>
        </VStack>
      )}
    </Box>
  );
}
