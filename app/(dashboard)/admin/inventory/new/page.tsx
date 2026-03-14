'use client';

import { useState } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Flex } from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { useRouter } from 'next/navigation';

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const body = {
      brand: fd.get('brand'),
      pattern: fd.get('pattern'),
      width: Number(fd.get('width')),
      aspect: Number(fd.get('aspect')),
      rim: Number(fd.get('rim')),
      season: fd.get('season'),
      speedRating: fd.get('speedRating') || null,
      loadIndex: fd.get('loadIndex') ? Number(fd.get('loadIndex')) : null,
      priceNew: fd.get('priceNew') || null,
      priceUsed: fd.get('priceUsed') || null,
      stockNew: Number(fd.get('stockNew') || 0),
      stockUsed: Number(fd.get('stockUsed') || 0),
      runFlat: fd.get('runFlat') === 'on',
    };

    const res = await fetch('/api/admin/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      router.push('/admin/inventory');
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to create product');
    }
    setSaving(false);
  }

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };
  const labelStyle = { color: c.muted, fontSize: 'sm' as const, mb: 1 };

  return (
    <VStack align="stretch" gap={6} maxW="600px">
      <Box>
        <Heading size="lg" color={c.text}>New Tyre Product</Heading>
        <Text color={c.muted} mt={1}>Add a new product to the catalogue</Text>
      </Box>

      {error && (
        <Box bg="#7F1D1D" p={3} borderRadius="md">
          <Text color={c.text}>{error}</Text>
        </Box>
      )}

      <form onSubmit={handleSubmit}>
      <Box>
        <VStack align="stretch" gap={4}>
          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Brand *</Text>
              <Input {...inputProps} name="brand" required />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Pattern *</Text>
              <Input {...inputProps} name="pattern" required />
            </Box>
          </HStack>

          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Width *</Text>
              <Input {...inputProps} name="width" type="number" required placeholder="205" />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Aspect *</Text>
              <Input {...inputProps} name="aspect" type="number" required placeholder="55" />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Rim *</Text>
              <Input {...inputProps} name="rim" type="number" required placeholder="16" />
            </Box>
          </HStack>

          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Season *</Text>
              <Input {...inputProps} name="season" required placeholder="summer / winter / all-season" />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Speed Rating</Text>
              <Input {...inputProps} name="speedRating" placeholder="V" />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Load Index</Text>
              <Input {...inputProps} name="loadIndex" type="number" placeholder="91" />
            </Box>
          </HStack>

          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Price New (£)</Text>
              <Input {...inputProps} name="priceNew" type="number" step="0.01" />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Price Used (£)</Text>
              <Input {...inputProps} name="priceUsed" type="number" step="0.01" />
            </Box>
          </HStack>

          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Stock New</Text>
              <Input {...inputProps} name="stockNew" type="number" defaultValue={0} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Stock Used</Text>
              <Input {...inputProps} name="stockUsed" type="number" defaultValue={0} />
            </Box>
          </HStack>

          <HStack gap={4}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: c.muted }}>
              <Input {...inputProps} type="checkbox" name="runFlat" /> Run Flat
            </label>
          </HStack>

          <Flex gap={3} pt={2}>
            <Button type="submit" bg={c.accent} color="white" _hover={{ bg: c.accentHover }} disabled={saving}>
              {saving ? 'Creating...' : 'Create Product'}
            </Button>
            <Button bg={c.surface} color={c.text} borderWidth="1px" borderColor={c.border} onClick={() => router.push('/admin/inventory')}>
              Cancel
            </Button>
          </Flex>
        </VStack>
      </Box>
      </form>
    </VStack>
  );
}
