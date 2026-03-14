'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Textarea, Flex } from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps } from '@/lib/design-tokens';
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
  { key: 'site_email', label: 'Contact Email', placeholder: 'info@tyrerescue.co.uk' },
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
      <Box>
        <Heading size="lg" color={c.text}>Content</Heading>
        <Text color={c.muted} mt={1}>Manage site-wide text and settings</Text>
      </Box>

      <form onSubmit={handleSubmit}>
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
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

          <Button type="submit" bg={c.accent} color="white" _hover={{ bg: c.accentHover }} alignSelf="flex-start" disabled={saving}>
            {saving ? 'Saving...' : 'Save All'}
          </Button>
        </VStack>
      </Box>
      </form>
    </VStack>
  );
}
