'use client';

import { useState, useEffect } from 'react';
import { Box, Heading, Text, VStack, HStack, Button, Input, Flex } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { useRouter } from 'next/navigation';

interface TyreData {
  id: string;
  brand: string;
  pattern: string;
  width: number;
  aspect: number;
  rim: number;
  season: string;
  speedRating: string | null;
  loadIndex: number | null;
  priceNew: string | null;
  priceUsed: string | null;
  stockNew: number | null;
  stockUsed: number | null;
  runFlat: boolean | null;
}

export function EditProductClient({ tyre }: { tyre: TyreData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

    const res = await fetch(`/api/admin/inventory/${tyre.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push('/admin/inventory');
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to update product');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/inventory/${tyre.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/admin/inventory');
    } else {
      setError('Failed to delete product');
    }
    setDeleting(false);
  }

  const inputStyle = { bg: c.surface, borderColor: c.border, color: c.text };
  const labelStyle = { color: c.muted, fontSize: 'sm' as const, mb: 1 };

  return (
    <VStack align="stretch" gap={6} maxW="600px">
      <Flex justify="space-between" align="center">
        <Box>
          <Heading size="lg" color={c.text}>Edit Product</Heading>
          <Text color={c.muted} mt={1}>{tyre.brand} {tyre.pattern} — {tyre.width}/{tyre.aspect}R{tyre.rim}</Text>
        </Box>
        <Button bg="#7F1D1D" color="white" size="sm" _hover={{ bg: '#991B1B' }} onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </Flex>

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
              <Text {...labelStyle}>Brand</Text>
              <Input name="brand" defaultValue={tyre.brand} required {...inputStyle} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Pattern</Text>
              <Input name="pattern" defaultValue={tyre.pattern} required {...inputStyle} />
            </Box>
          </HStack>
          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Width</Text>
              <Input name="width" type="number" defaultValue={tyre.width} required {...inputStyle} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Aspect</Text>
              <Input name="aspect" type="number" defaultValue={tyre.aspect} required {...inputStyle} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Rim</Text>
              <Input name="rim" type="number" defaultValue={tyre.rim} required {...inputStyle} />
            </Box>
          </HStack>
          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Season</Text>
              <Input name="season" defaultValue={tyre.season} required {...inputStyle} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Speed Rating</Text>
              <Input name="speedRating" defaultValue={tyre.speedRating ?? ''} {...inputStyle} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Load Index</Text>
              <Input name="loadIndex" type="number" defaultValue={tyre.loadIndex ?? ''} {...inputStyle} />
            </Box>
          </HStack>
          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Price New (£)</Text>
              <Input name="priceNew" type="number" step="0.01" defaultValue={tyre.priceNew ?? ''} {...inputStyle} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Price Used (£)</Text>
              <Input name="priceUsed" type="number" step="0.01" defaultValue={tyre.priceUsed ?? ''} {...inputStyle} />
            </Box>
          </HStack>
          <HStack gap={4}>
            <Box flex={1}>
              <Text {...labelStyle}>Stock New</Text>
              <Input name="stockNew" type="number" defaultValue={tyre.stockNew ?? 0} {...inputStyle} />
            </Box>
            <Box flex={1}>
              <Text {...labelStyle}>Stock Used</Text>
              <Input name="stockUsed" type="number" defaultValue={tyre.stockUsed ?? 0} {...inputStyle} />
            </Box>
          </HStack>
          <HStack gap={4}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: c.muted }}>
              <input type="checkbox" name="runFlat" defaultChecked={tyre.runFlat ?? false} /> Run Flat
            </label>
          </HStack>
          <Flex gap={3} pt={2}>
            <Button type="submit" bg={c.accent} color="white" _hover={{ bg: c.accentHover }} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
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
